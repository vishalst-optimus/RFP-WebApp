"""
RFP Data Management Utilities
Additional utility functions for working with RFP data in Cosmos DB
"""
from typing import List, Dict, Any, Optional
from application.services.cosmos_service.rfp_data_service import RFPDataService
import json
from datetime import datetime


class RFPDataManager:
    """Higher-level management class for RFP data operations"""
    
    def __init__(self):
        self.data_service = RFPDataService()
    
    async def get_user_rfp_summary(self, tenant_id: str, user_id: str) -> Dict[str, Any]:
        """
        Get a summary of all RFPs for a user
        
        Returns:
            Dict containing summary statistics and RFP list
        """
        user_data = await self.data_service.get_user_rfp_data(tenant_id, user_id)
        
        if not user_data:
            return {
                "total_rfps": 0,
                "exported_rfps": 0,
                "avg_confidence": 0.0,
                "rfps": [],
                "last_updated": None
            }
        
        rfps = user_data.get("RFP_Data", [])
        exported_count = sum(1 for rfp in rfps if rfp.get("isExported", False))
        avg_confidence = sum(rfp.get("confidenceScore", 0) for rfp in rfps) / len(rfps) if rfps else 0
        
        return {
            "total_rfps": len(rfps),
            "exported_rfps": exported_count,
            "avg_confidence": round(avg_confidence, 2),
            "rfps": [
                {
                    "name": rfp.get("RFP_Name"),
                    "isExported": rfp.get("isExported", False),
                    "confidenceScore": rfp.get("confidenceScore"),
                    "sectionCount": len(rfp.get("sections", [])),
                    "createdAt": rfp.get("createdAt"),
                    "updatedAt": rfp.get("updatedAt")
                }
                for rfp in rfps
            ],
            "last_updated": user_data.get("updatedAt")
        }
    
    async def export_rfp_to_json(self, tenant_id: str, user_id: str, rfp_name: str) -> Optional[str]:
        """
        Export an RFP to JSON format and mark as exported
        
        Returns:
            JSON string of the RFP data or None if not found
        """
        rfp_data = await self.data_service.get_rfp_by_name(tenant_id, user_id, rfp_name)
        
        if not rfp_data:
            return None
        
        # Mark as exported
        await self.data_service.mark_rfp_as_exported(tenant_id, user_id, rfp_name)
        
        # Return formatted JSON
        export_data = {
            "rfp_name": rfp_data.get("RFP_Name"),
            "export_date": datetime.utcnow().isoformat(),
            "confidence_score": rfp_data.get("confidenceScore"),
            "sections": rfp_data.get("sections", []),
            "metadata": {
                "created_at": rfp_data.get("createdAt"),
                "updated_at": rfp_data.get("updatedAt"),
                "session_id": rfp_data.get("sessionId")
            }
        }
        
        return json.dumps(export_data, indent=2)
    
    async def update_section_content(
        self, 
        tenant_id: str, 
        user_id: str, 
        rfp_name: str, 
        section_name: str, 
        new_content: str,
        confidence: float = None
    ) -> bool:
        """
        Update the content of a specific section
        
        Returns:
            True if update was successful, False otherwise
        """
        user_data = await self.data_service.get_user_rfp_data(tenant_id, user_id)
        
        if not user_data or "RFP_Data" not in user_data:
            return False
        
        # Find the RFP and section
        updated = False
        for rfp in user_data["RFP_Data"]:
            if rfp.get("RFP_Name") == rfp_name:
                for section in rfp.get("sections", []):
                    if section.get("SectionName") == section_name:
                        section["Content"] = new_content
                        if confidence is not None:
                            section["Confidence"] = confidence
                        updated = True
                        break
                
                if updated:
                    rfp["updatedAt"] = datetime.utcnow().isoformat()
                    break
        
        if updated:
            # Update the document
            user_data["updatedAt"] = datetime.utcnow().isoformat()
            
            try:
                async with self.data_service.get_cosmos_container() as container:
                    await container.upsert_item(body=user_data)
                return True
            except Exception:
                return False
        
        return False
    
    async def delete_rfp(self, tenant_id: str, user_id: str, rfp_name: str) -> bool:
        """
        Delete an RFP from user's data
        
        Returns:
            True if deletion was successful, False otherwise
        """
        user_data = await self.data_service.get_user_rfp_data(tenant_id, user_id)
        
        if not user_data or "RFP_Data" not in user_data:
            return False
        
        # Find and remove the RFP
        rfp_data_list = user_data["RFP_Data"]
        initial_count = len(rfp_data_list)
        
        user_data["RFP_Data"] = [
            rfp for rfp in rfp_data_list 
            if rfp.get("RFP_Name") != rfp_name
        ]
        
        if len(user_data["RFP_Data"]) < initial_count:
            # Update counts and timestamp
            user_data["Total_RFPs"] = len(user_data["RFP_Data"])
            user_data["updatedAt"] = datetime.utcnow().isoformat()
            
            try:
                async with self.data_service.get_cosmos_container() as container:
                    await container.upsert_item(body=user_data)
                return True
            except Exception:
                return False
        
        return False