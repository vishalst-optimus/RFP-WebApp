"""
RFP Data Service
Handles storing and retrieving RFP analysis data in Cosmos DB
"""
import os
import uuid
from typing import List, Dict, Optional, Any
from datetime import datetime
import asyncio
from azure.cosmos.aio import CosmosClient
from azure.cosmos import PartitionKey, exceptions
from contextlib import asynccontextmanager
from application.services.langgraph_services.checkpointers.cosmos_db_handler import CosmosClientSingleton
from application.services.logging_service.logging import telemetry_client


class RFPDataService:
    """Service for managing RFP analysis data in Cosmos DB"""
    
    def __init__(self):
        self.client = None
        self.database_name = os.environ.get("AZURE_COSMOSDB_NAME", "Conversations")
        self.container_name = os.environ.get("AZURE_COSMOSDB_RFP_DATA_CONTAINER", "RFPData")
    
    @asynccontextmanager
    async def get_cosmos_container(self):
        """Get Cosmos DB container with proper error handling"""
        client = None
        try:
            client = CosmosClientSingleton.get_instance()
            database = client.get_database_client(self.database_name)
            container = database.get_container_client(self.container_name)
            yield container
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to connect to Cosmos DB: {str(ex)}")
    
    async def store_rfp_analysis_data(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        file_name: str,
        sections_data: List[Dict[str, Any]],
        confidence_score: float = 0.0,
        session_id: Optional[str] = None
    ) -> str:
        """
        Store RFP analysis data in Cosmos DB
        
        Args:
            tenant_id: The tenant/organization ID (used as partition key)
            user_id: The user ID (used as document id)
            rfp_name: Name of the RFP document
            sections_data: List of sections with content and metadata
            confidence_score: Overall confidence score for the analysis
            session_id: Optional session ID for tracking
            
        Returns:
            str: The document ID of the stored record (user_id)
        """
        try:
            async with self.get_cosmos_container() as container:
                # Check if user already has RFP data
                print(f"🔍 Looking for existing document with user_id={user_id}, tenant_id={tenant_id} (partition key: {user_id})")
                existing_data = await self.get_user_rfp_data(tenant_id, user_id)
                
                if existing_data:
                    print(f"📋 Found existing data for user {user_id}, updating with new RFP: {rfp_name}")
                    print(f"📊 Current RFP_Data list has {len(existing_data.get('RFP_Data', []))} entries")
                    # Update existing record
                    updated_data = self._update_existing_rfp_data(
                        existing_data, rfp_name, file_name, sections_data, confidence_score, session_id
                    )
                    print(f"📊 Updated document now has {updated_data['Total_RFPs']} RFPs")
                else:
                    print(f"🆕 Creating new document for user {user_id} with RFP: {rfp_name}")
                    # Create new record
                    updated_data = self._create_new_rfp_data(
                        user_id, tenant_id, user_id, rfp_name, file_name, sections_data, confidence_score, session_id
                    )
                
                # Store in Cosmos DB
                print(f"💾 About to upsert document with id={updated_data.get('id')}")
                await container.upsert_item(body=updated_data)
                print(f"💾 Successfully upserted document for user {user_id}")
                
                telemetry_client.track_trace(
                    f"RFP analysis data stored successfully for user {user_id}, RFP: {rfp_name}",
                    severity=1
                )
                
                return user_id
                
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to store RFP analysis data: {str(ex)}")
    
    async def get_user_rfp_data(self, tenant_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve RFP data for a specific user
        
        Args:
            tenant_id: The tenant/organization ID (partition key)
            user_id: The user ID (document id)
            
        Returns:
            Dict containing user's RFP data or None if not found
        """
        try:
            async with self.get_cosmos_container() as container:
                
                try:
                    print(f"🔎 Attempting to read document with item={user_id}, partition_key={user_id}")
                    
                    # Try the direct read first (most efficient)
                    response = await container.read_item(
                        item=user_id,  # Use user_id directly as document id
                        partition_key=user_id  # Use user_id as partition key
                    )
                    print(f"✅ Found existing document for user {user_id}")
                    return response
                except exceptions.CosmosResourceNotFoundError:
                    print(f"❌ No existing document found for user {user_id} (partition key: {user_id})")
                    return None
                    
        except Exception as ex:
            print(f"💥 Error reading document: {str(ex)}")
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to retrieve RFP data: {str(ex)}")
    
    async def get_rfp_by_name(self, tenant_id: str, user_id: str, rfp_name: str) -> Optional[Dict[str, Any]]:
        """
        Get specific RFP by name for a user
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID  
            rfp_name: Name of the RFP to find
            
        Returns:
            Dict containing the RFP data or None if not found
        """
        user_data = await self.get_user_rfp_data(tenant_id, user_id)
        
        if user_data and "RFP_Data" in user_data:
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == rfp_name:
                    return rfp
        
        return None
    
    async def mark_rfp_as_exported(self, tenant_id: str, user_id: str, rfp_name: str) -> bool:
        """
        Mark an RFP as exported
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            rfp_name: Name of the RFP to mark as exported
            
        Returns:
            bool: True if successfully updated, False if RFP not found
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                return False
            
            # Find and update the RFP
            updated = False
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == rfp_name:
                    rfp["isExported"] = True
                    rfp["exportedAt"] = datetime.utcnow().isoformat()
                    updated = True
                    break
            
            if updated:
                async with self.get_cosmos_container() as container:
                    await container.upsert_item(body=user_data)
                    
                telemetry_client.track_trace(
                    f"RFP {rfp_name} marked as exported for user {user_id}",
                    severity=1
                )
            
            return updated
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to mark RFP as exported: {str(ex)}")
    
    def _create_new_rfp_data(
        self,
        document_id: str,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        file_name: str,
        sections_data: List[Dict[str, Any]],
        confidence_score: float,
        session_id: Optional[str]
    ) -> Dict[str, Any]:
        """Create a new RFP data document structure"""
        
        # Transform sections data to match the required schema
        sections = []
        for section in sections_data:
            section_entry = {
                "SectionName": section.get("name", "Unknown Section"),
                "Content": section.get("content", ""),
                "Image": section.get("image", ""),
                "Confidence": section.get("confidence", 0.0)
            }
            sections.append(section_entry)
        
        rfp_entry = {
            "RFP_Name": rfp_name,
            "file_name": file_name,
            "isExported": False,
            "confidenceScore": confidence_score,
            "sections": sections,
            "createdAt": datetime.utcnow().isoformat(),
            "sessionId": session_id
        }
        
        return {
            "id": user_id,  # Use user_id as document id
            "Tenant_id": tenant_id,
            "User_id": user_id,
            "Total_RFPs": 1,
            "RFP_Data": [rfp_entry],
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat()
        }
    
    def _update_existing_rfp_data(
        self,
        existing_data: Dict[str, Any],
        rfp_name: str,
        file_name: str,
        sections_data: List[Dict[str, Any]],
        confidence_score: float,
        session_id: Optional[str]
    ) -> Dict[str, Any]:
        """Update existing RFP data with new RFP entry"""
        
        # Transform sections data
        sections = []
        for section in sections_data:
            section_entry = {
                "SectionName": section.get("name", "Unknown Section"),
                "Content": section.get("content", ""),
                "Image": section.get("image", ""),
                "Confidence": section.get("confidence", 0.0)
            }
            sections.append(section_entry)
        
        # Check if RFP already exists
        rfp_data_list = existing_data.get("RFP_Data", [])
        rfp_found = False
        
        print(f"🔍 Checking for existing RFP '{rfp_name}' in {len(rfp_data_list)} existing RFPs")
        
        for i, rfp in enumerate(rfp_data_list):
            if rfp.get("RFP_Name") == rfp_name:
                print(f"🔄 Found existing RFP '{rfp_name}' at index {i}, updating it")
                # Update existing RFP
                rfp_data_list[i] = {
                    "RFP_Name": rfp_name,
                    "file_name": file_name,
                    "isExported": rfp.get("isExported", False),  # Preserve export status
                    "confidenceScore": confidence_score,
                    "sections": sections,
                    "createdAt": rfp.get("createdAt", datetime.utcnow().isoformat()),
                    "updatedAt": datetime.utcnow().isoformat(),
                    "sessionId": session_id
                }
                rfp_found = True
                break
        
        if not rfp_found:
            print(f"➕ Adding new RFP '{rfp_name}' to the list")
            # Add new RFP entry
            new_rfp = {
                "RFP_Name": rfp_name,
                "file_name": file_name,
                "isExported": False,
                "confidenceScore": confidence_score,
                "sections": sections,
                "createdAt": datetime.utcnow().isoformat(),
                "sessionId": session_id
            }
            rfp_data_list.append(new_rfp)
            print(f"📈 RFP list size increased from {len(rfp_data_list)-1} to {len(rfp_data_list)}")
        
        # Update the document
        existing_data["RFP_Data"] = rfp_data_list
        existing_data["Total_RFPs"] = len(rfp_data_list)
        existing_data["updatedAt"] = datetime.utcnow().isoformat()
        
        print(f"📊 Final document will have {len(rfp_data_list)} RFPs with Total_RFPs = {existing_data['Total_RFPs']}")
        
        return existing_data
    
    async def get_pricing_sections(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str
    ) -> List[Dict[str, Any]]:
        """
        Get all sections for a specific RFP with pricing/cost classification
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            rfp_name: Name of the RFP to get sections for
            
        Returns:
            List[Dict]: List of sections with id, name, and isPricingRelated fields
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                return []
            
            # Find the RFP
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == rfp_name:
                    sections = rfp.get("sections", [])
                    formatted_sections = []
                    
                    # Keywords to identify pricing/cost sections
                    pricing_keywords = [
                        "cost", "costs", "pricing", "price", "prices", "budget", "budgets",
                        "fee", "fees", "rate", "rates", "payment", "payments", "financial",
                        "commercial", "commercial proposal", "commercial response",
                        "proposal", "economic", "economics", "expenditure", "expense",
                        "expenses", "charge", "charges", "billing", "invoice", "invoicing"
                    ]
                    
                    # Process all sections
                    for index, section in enumerate(sections):
                        section_name = section.get("SectionName", "")
                        section_name_lower = section_name.lower()
                        
                        # Check if section is pricing related
                        is_pricing_related = any(keyword in section_name_lower for keyword in pricing_keywords)
                        
                        formatted_sections.append({
                            "id": f"{rfp_name}_{index}_{section_name.replace(' ', '_')}",
                            "name": section_name,
                            "isPricingRelated": is_pricing_related
                        })
                    
                    telemetry_client.track_trace(
                        f"Retrieved {len(formatted_sections)} sections for RFP '{rfp_name}' (user: {user_id})",
                        severity=1
                    )
                    
                    return formatted_sections
            
            # RFP not found
            return []
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to retrieve pricing sections: {str(ex)}")

    async def add_new_section(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        section_name: str,
        section_content: str
    ) -> str:
        """
        Add a new section to an existing RFP
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            rfp_name: Name of the RFP to add section to
            section_name: Name of the new section
            section_content: Content for the new section
            
        Returns:
            str: ID of the created section
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                raise Exception(f"RFP data not found for user {user_id}")
            
            # Find the RFP
            rfp_found = False
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == rfp_name:
                    rfp_found = True
                    
                    # Get current section count to generate index
                    current_sections = rfp.get("sections", [])
                    section_index = len(current_sections)
                    
                    # Create new section
                    new_section = {
                        "SectionName": section_name,
                        "Content": section_content,
                        "Image": "",
                        "Confidence": 0
                    }
                    
                    # Add section to RFP
                    if "sections" not in rfp:
                        rfp["sections"] = []
                    
                    rfp["sections"].append(new_section)
                    rfp["updatedAt"] = datetime.utcnow().isoformat()
                    
                    # Generate section ID
                    section_id = f"{rfp_name}_{section_index}_{section_name.replace(' ', '_')}"
                    
                    break
            
            if not rfp_found:
                raise Exception(f"RFP '{rfp_name}' not found for user {user_id}")
            
            # Update document timestamp
            user_data["updatedAt"] = datetime.utcnow().isoformat()
            
            # Save to Cosmos DB
            async with self.get_cosmos_container() as container:
                await container.upsert_item(body=user_data)
            
            telemetry_client.track_trace(
                f"Added new section '{section_name}' to RFP '{rfp_name}' (user: {user_id})",
                severity=1
            )
            
            return section_id
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to add new section: {str(ex)}")

    async def add_new_section_with_details(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        section_name: str,
        section_content: str
    ) -> Dict[str, Any]:
        """
        Add a new section to an existing RFP and return detailed section information
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            rfp_name: Name of the RFP to add section to
            section_name: Name of the new section
            section_content: Content for the new section
            
        Returns:
            Dict[str, Any]: Detailed section information including id, name, content, etc.
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                raise Exception(f"RFP data not found for user {user_id}")
            
            # Find the RFP
            rfp_found = False
            section_details = {}
            
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == rfp_name:
                    rfp_found = True
                    
                    # Get current section count to generate index
                    current_sections = rfp.get("sections", [])
                    section_index = len(current_sections)
                    
                    # Create new section
                    new_section = {
                        "SectionName": section_name,
                        "Content": section_content,
                        "Image": "",
                        "Confidence": 0
                    }
                    
                    # Add section to RFP
                    if "sections" not in rfp:
                        rfp["sections"] = []
                    
                    rfp["sections"].append(new_section)
                    rfp["updatedAt"] = datetime.utcnow().isoformat()
                    
                    # Generate section ID and prepare details
                    section_id = f"{rfp_name}_{section_index}_{section_name.replace(' ', '_')}"
                    section_details = {
                        "id": section_id,
                        "name": section_name,
                        "content": section_content,
                        "section_order": section_index
                    }
                    
                    break
            
            if not rfp_found:
                raise Exception(f"RFP '{rfp_name}' not found for user {user_id}")
            
            # Update document timestamp
            user_data["updatedAt"] = datetime.utcnow().isoformat()
            
            # Save to Cosmos DB
            async with self.get_cosmos_container() as container:
                await container.upsert_item(body=user_data)
            
            telemetry_client.track_trace(
                f"Added new section '{section_name}' to RFP '{rfp_name}' (user: {user_id})",
                severity=1
            )
            
            return section_details
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to add new section with details: {str(ex)}")

    async def append_content_to_sections(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        section_ids: List[str],
        content_to_append: str
    ) -> bool:
        """
        Append content to multiple sections by their IDs
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            rfp_name: Name of the RFP
            section_ids: List of section IDs to append content to
            content_to_append: Content to append to sections
            
        Returns:
            bool: True if successfully updated
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                return False
            
            # Find the RFP
            rfp_found = False
            sections_updated = 0
            
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == rfp_name:
                    rfp_found = True
                    sections = rfp.get("sections", [])
                    
                    # Process each section and check if its ID matches
                    for index, section in enumerate(sections):
                        section_name = section.get("SectionName", "")
                        section_id = f"{rfp_name}_{index}_{section_name.replace(' ', '_')}"
                        
                        if section_id in section_ids:
                            # Append content to existing content
                            existing_content = section.get("Content", "")
                            if existing_content:
                                section["Content"] = existing_content + "\n\n" + content_to_append
                            else:
                                section["Content"] = content_to_append
                            sections_updated += 1
                    
                    if sections_updated > 0:
                        rfp["updatedAt"] = datetime.utcnow().isoformat()
                    
                    break
            
            if not rfp_found:
                return False
            
            if sections_updated > 0:
                # Update document timestamp
                user_data["updatedAt"] = datetime.utcnow().isoformat()
                
                # Save to Cosmos DB
                async with self.get_cosmos_container() as container:
                    await container.upsert_item(body=user_data)
                
                telemetry_client.track_trace(
                    f"Appended content to {sections_updated} sections in RFP '{rfp_name}' (user: {user_id})",
                    severity=1
                )
            
            return sections_updated > 0
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to append content to sections: {str(ex)}")

    async def append_content_to_sections_with_details(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        section_ids: List[str],
        content_to_append: str
    ) -> List[Dict[str, Any]]:
        """
        Append content to multiple sections by their IDs and return detailed section information
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            rfp_name: Name of the RFP
            section_ids: List of section IDs to append content to
            content_to_append: Content to append to sections
            
        Returns:
            List[Dict[str, Any]]: List of detailed section information for updated sections
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                return []
            
            # Find the RFP
            rfp_found = False
            updated_sections = []
            
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == rfp_name:
                    rfp_found = True
                    sections = rfp.get("sections", [])
                    
                    # Process each section and check if its ID matches
                    for index, section in enumerate(sections):
                        section_name = section.get("SectionName", "")
                        section_id = f"{rfp_name}_{index}_{section_name.replace(' ', '_')}"
                        
                        if section_id in section_ids:
                            # Append content to existing content
                            existing_content = section.get("Content", "")
                            if existing_content:
                                section["Content"] = existing_content + "\n\n" + content_to_append
                            else:
                                section["Content"] = content_to_append
                            
                            # Add to updated sections list
                            updated_sections.append({
                                "id": section_id,
                                "name": section_name,
                                "content": section["Content"],
                                "section_order": index
                            })
                    
                    if updated_sections:
                        rfp["updatedAt"] = datetime.utcnow().isoformat()
                    
                    break
            
            if not rfp_found:
                return []
            
            if updated_sections:
                # Update document timestamp
                user_data["updatedAt"] = datetime.utcnow().isoformat()
                
                # Save to Cosmos DB
                async with self.get_cosmos_container() as container:
                    await container.upsert_item(body=user_data)
                
                telemetry_client.track_trace(
                    f"Appended content to {len(updated_sections)} sections in RFP '{rfp_name}' (user: {user_id})",
                    severity=1
                )
            
            return updated_sections
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to append content to sections with details: {str(ex)}")

    async def get_past_rfps(
        self,
        tenant_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all past RFPs (exported RFPs) for a user
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            
        Returns:
            List[Dict[str, Any]]: List of exported RFPs with formatted information
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                return []
            
            past_rfps = []
            rfp_counter = 1
            
            # Process all RFPs and filter exported ones
            for rfp in user_data["RFP_Data"]:
                if rfp.get("isExported", False):  # Only include exported RFPs
                    rfp_name = rfp.get("RFP_Name", "")
                    sections = rfp.get("sections", [])
                    created_at = rfp.get("createdAt", "")
                    
                    # Format the date (extract just the date part from ISO string)
                    formatted_date = created_at
                    if created_at:
                        try:
                            # Parse ISO date and format as YYYY-MM-DD
                            from datetime import datetime
                            parsed_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            formatted_date = parsed_date.strftime("%Y-%m-%d")
                        except:
                            # If parsing fails, keep original
                            formatted_date = created_at[:10] if len(created_at) >= 10 else created_at
                    
                    past_rfp = {
                        "id": f"rfp_{rfp_counter:03d}",
                        "name": rfp_name,
                        "sections": len(sections),
                        "date": formatted_date
                    }
                    
                    past_rfps.append(past_rfp)
                    rfp_counter += 1
            
            telemetry_client.track_trace(
                f"Retrieved {len(past_rfps)} past RFPs for user {user_id}",
                severity=1
            )
            
            return past_rfps
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to retrieve past RFPs: {str(ex)}")

    async def get_rfp_sections_by_id(
        self,
        tenant_id: str,
        user_id: str,
        rfp_id: str
    ) -> Dict[str, Any]:
        """
        Get sections for a specific RFP by its ID (format: rfp_001, rfp_002, etc.)
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            rfp_id: The RFP ID in format "rfp_001", "rfp_002", etc.
            
        Returns:
            Dict[str, Any]: RFP information with sections or None if not found
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                return None
            
            # Extract the index from rfp_id (e.g., "rfp_001" -> 1)
            try:
                rfp_index = int(rfp_id.split("_")[1])
            except (IndexError, ValueError):
                raise Exception(f"Invalid RFP ID format: {rfp_id}. Expected format: rfp_001, rfp_002, etc.")
            
            exported_rfps = []
            
            # Filter exported RFPs and build the list with correct indexing
            for rfp in user_data["RFP_Data"]:
                if rfp.get("isExported", False):
                    exported_rfps.append(rfp)
            
            # Check if the requested index exists
            if rfp_index < 1 or rfp_index > len(exported_rfps):
                return None
            
            # Get the RFP at the specified index (rfp_001 = index 0)
            target_rfp = exported_rfps[rfp_index - 1]
            rfp_name = target_rfp.get("RFP_Name", "")
            sections = target_rfp.get("sections", [])
            
            # Format sections with sequential IDs
            formatted_sections = []
            for index, section in enumerate(sections):
                section_id = f"section_{index + 1:03d}"
                section_name = section.get("SectionName", "")
                section_content = section.get("Content", "")
                
                formatted_sections.append({
                    "id": section_id,
                    "name": section_name,
                    "content": section_content
                })
            
            result = {
                "rfp_name": rfp_name,
                "sections": formatted_sections
            }
            
            telemetry_client.track_trace(
                f"Retrieved {len(formatted_sections)} sections for RFP ID {rfp_id} (user: {user_id})",
                severity=1
            )
            
            return result
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to retrieve RFP sections: {str(ex)}")

    async def import_sections_to_rfp(
        self,
        tenant_id: str,
        user_id: str,
        current_rfp_name: str,
        sections_to_import: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Import selected sections from past RFPs into the current RFP
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            current_rfp_name: Name of the current RFP to import sections into
            sections_to_import: List of sections with id and name to import
            
        Returns:
            Dict containing operation results and updated sections
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                raise Exception(f"User data not found for user {user_id}")
            
            # Find the current RFP
            current_rfp = None
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == current_rfp_name:
                    current_rfp = rfp
                    break
            
            if not current_rfp:
                raise Exception(f"Current RFP '{current_rfp_name}' not found")
            
            # Build a map of all exported RFPs for quick lookup
            exported_rfps = []
            for rfp in user_data["RFP_Data"]:
                if rfp.get("isExported", False):
                    exported_rfps.append(rfp)
            
            updated_sections = []
            operations_performed = []
            
            # Process each section to import
            for section_to_import in sections_to_import:
                section_id = section_to_import.get("id", "")
                section_name = section_to_import.get("name", "")
                
                # Parse section ID to get RFP index and section index
                # Format: "section_001" from rfp_001, section_002 from rfp_001, etc.
                try:
                    section_index = int(section_id.split("_")[1]) - 1  # Convert to 0-based index
                except (IndexError, ValueError):
                    print(f"⚠️ Invalid section ID format: {section_id}")
                    continue
                
                # Find the section content from exported RFPs
                section_content = ""
                source_rfp_name = ""
                
                # We need to find which RFP this section belongs to
                # Since we don't have RFP ID in the section ID, we'll search through all exported RFPs
                for rfp_index, exported_rfp in enumerate(exported_rfps):
                    rfp_sections = exported_rfp.get("sections", [])
                    
                    # Check if this section exists in this RFP and matches the name
                    if section_index < len(rfp_sections):
                        potential_section = rfp_sections[section_index]
                        if potential_section.get("SectionName", "") == section_name:
                            section_content = potential_section.get("Content", "")
                            source_rfp_name = exported_rfp.get("RFP_Name", "")
                            break
                
                if not section_content:
                    print(f"⚠️ Section content not found for {section_name} (ID: {section_id})")
                    continue
                
                # Check if section already exists in current RFP
                existing_section = None
                section_exists = False
                current_sections = current_rfp.get("sections", [])
                
                for existing_sec in current_sections:
                    if existing_sec.get("SectionName", "") == section_name:
                        existing_section = existing_sec
                        section_exists = True
                        break
                
                if section_exists:
                    # Update existing section
                    existing_section["Content"] = section_content
                    operations_performed.append("sections_updated")
                    is_new_section = False
                    print(f"✅ Updated existing section '{section_name}' in RFP '{current_rfp_name}'")
                else:
                    # Create new section
                    new_section = {
                        "SectionName": section_name,
                        "Content": section_content,
                        "Image": "",
                        "Confidence": 0
                    }
                    
                    if "sections" not in current_rfp:
                        current_rfp["sections"] = []
                    
                    current_rfp["sections"].append(new_section)
                    operations_performed.append("new_section_created")
                    is_new_section = True
                    print(f"✅ Created new section '{section_name}' in RFP '{current_rfp_name}'")
                
                # Determine completion status based on content length
                word_count = len(section_content.split()) if section_content else 0
                if word_count > 50:
                    completion_status = "complete"
                elif word_count > 0:
                    completion_status = "partial"
                else:
                    completion_status = "empty"
                
                # Determine section type
                section_type = "imported"
                if "pricing" in section_name.lower() or "cost" in section_name.lower():
                    section_type = "pricing"
                elif "executive" in section_name.lower() or "summary" in section_name.lower():
                    section_type = "executive"
                elif "background" in section_name.lower() or "company" in section_name.lower():
                    section_type = "company"
                
                updated_sections.append({
                    "id": f"{current_rfp_name}_{len(current_rfp.get('sections', []))}_{section_name.replace(' ', '_')}",
                    "name": section_name,
                    "type": section_type,
                    "content": section_content,
                    "completion_status": completion_status,
                    "isNewSection": is_new_section
                })
            
            if updated_sections:
                # Update RFP timestamp
                current_rfp["updatedAt"] = datetime.utcnow().isoformat()
                
                # Update document timestamp
                user_data["updatedAt"] = datetime.utcnow().isoformat()
                
                # Save to Cosmos DB
                async with self.get_cosmos_container() as container:
                    await container.upsert_item(body=user_data)
            
            # Determine operation type
            unique_operations = list(set(operations_performed))
            if len(unique_operations) > 1:
                operation = "mixed"
            elif len(unique_operations) == 1:
                operation = unique_operations[0]
            else:
                operation = "no_operations"
            
            telemetry_client.track_trace(
                f"Imported {len(updated_sections)} sections into RFP '{current_rfp_name}' (user: {user_id})",
                severity=1
            )
            
            return {
                "updated_sections": updated_sections,
                "operation": operation,
                "sections_processed": len(sections_to_import),
                "sections_imported": len(updated_sections)
            }
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to import sections: {str(ex)}")

    async def import_sections_between_rfps(
        self,
        tenant_id: str,
        user_id: str,
        source_rfp_name: str,
        current_rfp_name: str,
        sections_to_import: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Import selected sections from a source RFP into the current RFP
        
        Args:
            tenant_id: The tenant/organization ID
            user_id: The user ID
            source_rfp_name: Name of the source RFP to import sections from
            current_rfp_name: Name of the current RFP to import sections into
            sections_to_import: List of sections with id and name to import
            
        Returns:
            Dict containing operation results and updated sections
        """
        try:
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data or "RFP_Data" not in user_data:
                raise Exception(f"User data not found for user {user_id}")
            
            # Find the source RFP
            source_rfp = None
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == source_rfp_name:
                    source_rfp = rfp
                    break
            
            if not source_rfp:
                raise Exception(f"Source RFP '{source_rfp_name}' not found")
            
            # Find the current RFP
            current_rfp = None
            for rfp in user_data["RFP_Data"]:
                if rfp.get("RFP_Name") == current_rfp_name:
                    current_rfp = rfp
                    break
            
            if not current_rfp:
                raise Exception(f"Current RFP '{current_rfp_name}' not found")
            
            source_sections = source_rfp.get("sections", [])
            current_sections = current_rfp.get("sections", [])
            
            updated_sections = []
            operations_performed = []
            
            # Process each section to import
            for section_to_import in sections_to_import:
                section_id = section_to_import.get("id", "")
                section_name = section_to_import.get("name", "")
                
                # Parse section ID to get section index (section_001 -> index 0)
                try:
                    section_index = int(section_id.split("_")[1]) - 1  # Convert to 0-based index
                except (IndexError, ValueError):
                    print(f"⚠️ Invalid section ID format: {section_id}")
                    continue
                
                # Find the section content from source RFP
                section_content = ""
                if section_index < len(source_sections):
                    source_section = source_sections[section_index]
                    if source_section.get("SectionName", "") == section_name:
                        section_content = source_section.get("Content", "")
                    else:
                        # If index doesn't match, search by name in source sections
                        for source_sec in source_sections:
                            if source_sec.get("SectionName", "") == section_name:
                                section_content = source_sec.get("Content", "")
                                break
                
                if not section_content:
                    print(f"⚠️ Section content not found for '{section_name}' in source RFP '{source_rfp_name}'")
                    continue
                
                # Check if section already exists in current RFP
                existing_section = None
                section_exists = False
                
                for existing_sec in current_sections:
                    if existing_sec.get("SectionName", "") == section_name:
                        existing_section = existing_sec
                        section_exists = True
                        break
                
                if section_exists:
                    # Update existing section content
                    existing_section["Content"] = section_content
                    operations_performed.append("sections_updated")
                    is_new_section = False
                    print(f"✅ Updated existing section '{section_name}' in RFP '{current_rfp_name}' with content from '{source_rfp_name}'")
                else:
                    # Create new section
                    new_section = {
                        "SectionName": section_name,
                        "Content": section_content,
                        "Image": "",
                        "Confidence": 0
                    }
                    
                    current_sections.append(new_section)
                    operations_performed.append("new_section_created")
                    is_new_section = True
                    print(f"✅ Created new section '{section_name}' in RFP '{current_rfp_name}' with content from '{source_rfp_name}'")
                
                # Determine completion status based on content length
                word_count = len(section_content.split()) if section_content else 0
                if word_count > 50:
                    completion_status = "complete"
                elif word_count > 0:
                    completion_status = "partial"
                else:
                    completion_status = "empty"
                
                # Determine section type
                section_type = "imported"
                if "pricing" in section_name.lower() or "cost" in section_name.lower():
                    section_type = "pricing"
                elif "executive" in section_name.lower() or "summary" in section_name.lower():
                    section_type = "executive"
                elif "background" in section_name.lower() or "company" in section_name.lower():
                    section_type = "company"
                
                # Generate section ID for current RFP
                section_index_in_current = len(current_sections) if is_new_section else None
                if section_index_in_current is None:
                    # For existing sections, find the index
                    for idx, sec in enumerate(current_sections):
                        if sec.get("SectionName", "") == section_name:
                            section_index_in_current = idx
                            break
                
                updated_sections.append({
                    "id": f"{current_rfp_name}_{section_index_in_current}_{section_name.replace(' ', '_')}",
                    "name": section_name,
                    "type": section_type,
                    "content": section_content,
                    "completion_status": completion_status,
                    "isNewSection": is_new_section
                })
            
            if updated_sections:
                # Update current RFP sections and timestamp
                current_rfp["sections"] = current_sections
                current_rfp["updatedAt"] = datetime.utcnow().isoformat()
                
                # Update document timestamp
                user_data["updatedAt"] = datetime.utcnow().isoformat()
                
                # Save to Cosmos DB
                async with self.get_cosmos_container() as container:
                    await container.upsert_item(body=user_data)
            
            # Determine operation type
            unique_operations = list(set(operations_performed))
            if len(unique_operations) > 1:
                operation = "mixed"
            elif len(unique_operations) == 1:
                operation = unique_operations[0]
            else:
                operation = "no_operations"
            
            telemetry_client.track_trace(
                f"Imported {len(updated_sections)} sections from '{source_rfp_name}' into '{current_rfp_name}' (user: {user_id})",
                severity=1
            )
            
            return {
                "updated_sections": updated_sections,
                "operation": operation,
                "sections_processed": len(sections_to_import),
                "sections_imported": len(updated_sections)
            }
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise Exception(f"Failed to import sections between RFPs: {str(ex)}")
    
    async def update_section_content(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        section_name: str,
        new_content: str,
        image_url: Optional[str] = None,
        image_data: Optional[List[Dict]] = None
    ) -> bool:
        """
        Update content and image data for a specific section in an RFP
        
        Args:
            image_url: Legacy single image URL (for backward compatibility)
            image_data: New array format for images
        
        Returns:
            bool: True if update was successful, False otherwise
        """
        try:
            print(f"🔍 update_section_content called with:")
            print(f"   tenant_id: {tenant_id}")
            print(f"   user_id: {user_id}")
            print(f"   rfp_name: {rfp_name}")
            print(f"   section_name: {section_name}")
            print(f"   content_length: {len(new_content)}")
            print(f"   image_url: {image_url}")
            
            # Use the same approach as get_user_rfp_data method (which works successfully)
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data:
                print(f"❌ User document not found")
                return False
            
            print(f"✅ Successfully retrieved user document")
            rfp_data_array = user_data.get("RFP_Data", [])
            print(f"📋 Found {len(rfp_data_array)} RFPs in user document")
            
            # Find the RFP
            target_rfp = None
            for idx, rfp in enumerate(rfp_data_array):
                rfp_name_in_data = rfp.get("RFP_Name", "")
                print(f"   RFP {idx}: '{rfp_name_in_data}'")
                if rfp_name_in_data == rfp_name:
                    target_rfp = rfp
                    print(f"✅ Found target RFP at index {idx}")
                    break
            
            if not target_rfp:
                print(f"❌ RFP '{rfp_name}' not found in user data")
                return False
            
            # Find and update the section
            sections = target_rfp.get("sections", [])
            print(f"📋 Found {len(sections)} sections in RFP")
            section_found = False
            
            for idx, section in enumerate(sections):
                section_name_in_data = section.get("SectionName", "")
                print(f"   Section {idx}: '{section_name_in_data}'")
                if section_name_in_data == section_name:
                    print(f"✅ Found target section at index {idx}")
                    section["Content"] = new_content
                    
                    # Handle image data - prioritize new array format over legacy URL
                    if image_data is not None:
                        section["Image"] = image_data
                        print(f"🖼️ Updated image data array with {len(image_data)} images")
                    elif image_url:
                        # Legacy format - convert to new array format
                        section["Image"] = [{
                            "url": image_url,
                            "isInline": False,
                            "caption": ""
                        }]
                        print(f"🖼️ Converted legacy image URL to array format")
                    
                    section_found = True
                    break
            
            if not section_found:
                print(f"❌ Section '{section_name}' not found in RFP")
                return False
            
            # Update timestamp
            target_rfp["updatedAt"] = datetime.utcnow().isoformat()
            user_data["updatedAt"] = datetime.utcnow().isoformat()
            
            # Save to Cosmos DB using container
            async with self.get_cosmos_container() as container:
                await container.upsert_item(body=user_data)
                print(f"✅ Successfully updated Cosmos DB")
            
            telemetry_client.track_trace(
                f"Updated section '{section_name}' in RFP '{rfp_name}' (user: {user_id})",
                severity=1
            )
            
            return True
                
        except Exception as ex:
            print(f"❌ Error in update_section_content: {str(ex)}")
            telemetry_client.track_exception(ex)
            return False
    
    async def add_new_section(
        self,
        tenant_id: str,
        user_id: str,
        rfp_name: str,
        section_data: Dict[str, Any]
    ) -> bool:
        """
        Add a new section to an existing RFP
        
        Returns:
            bool: True if addition was successful, False otherwise
        """
        try:
            # Use the same approach as get_user_rfp_data method
            user_data = await self.get_user_rfp_data(tenant_id, user_id)
            
            if not user_data:
                return False
            
            rfp_data_array = user_data.get("RFP_Data", [])
                
                # Find the RFP
            target_rfp = None
            for rfp in rfp_data_array:
                if rfp.get("RFP_Name") == rfp_name:
                    target_rfp = rfp
                    break
            
            if not target_rfp:
                return False
            
            # Add new section
            sections = target_rfp.get("sections", [])
            sections.append(section_data)
            
            # Update timestamp
            target_rfp["updatedAt"] = datetime.utcnow().isoformat()
            user_data["updatedAt"] = datetime.utcnow().isoformat()
            
            # Save to Cosmos DB using container
            async with self.get_cosmos_container() as container:
                await container.upsert_item(body=user_data)
            
            telemetry_client.track_trace(
                f"Added new section '{section_data.get('SectionName', 'Unknown')}' to RFP '{rfp_name}' (user: {user_id})",
                severity=1
            )
            
            return True
                
        except Exception as ex:
            telemetry_client.track_exception(ex)
            return False