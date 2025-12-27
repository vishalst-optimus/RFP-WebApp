"""
Table Generation Service - Handles file table generation and processing
"""
import datetime
from typing import Dict, List
from openai import AzureOpenAI
import os
from pydantic import BaseModel
from application.services.logging_service.logging import telemetry_client

class FileTableRequest(BaseModel):
    rfpName: str
    sessionId: str
    selectedSections: List[str] = None
    sectionName: str = None
    fileName: str = None
    tableData: List[Dict] = []
    notes: str = None

# Azure OpenAI client setup for table generation
table_generation_client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)

async def generate_file_table_with_llm(request: FileTableRequest) -> str:
    """
    Generate professional tables from file data using LLM with proper markdown formatting
    Creates separate tables based on data grouping or keeps as single table if appropriate
    
    Args:
        request: FileTableRequest containing table data and metadata
        
    Returns:
        str: Professional markdown formatted table(s)
    """
    try:
        # Extract column headers from the first row
        if not request.tableData or len(request.tableData) == 0:
            raise ValueError("No table data provided")
        
        columns = list(request.tableData[0].keys())
        rows_count = len(request.tableData)
        
        # Analyze data structure to determine if we should create separate tables
        table_groups = analyze_data_for_grouping(request.tableData)
        
        if len(table_groups) > 1:
            # Multiple logical groups detected - create separate tables
            return await generate_multiple_tables_with_llm(request, table_groups)
        else:
            # Single table - process as one table
            return await generate_single_table_with_llm(request)
        
    except Exception as ex:
        # Fallback to manual table generation if LLM fails
        telemetry_client.track_exception(ex)
        return generate_fallback_file_table(request)

def analyze_data_for_grouping(table_data: List[Dict]) -> List[List[Dict]]:
    """
    Analyze table data to determine logical groupings for separate tables
    
    Args:
        table_data: List of dictionaries representing table rows
        
    Returns:
        List of grouped data (each group becomes a separate table)
    """
    if not table_data or len(table_data) == 0:
        return []
    
    columns = list(table_data[0].keys())
    
    # Strategy 1: Check for sheet-based data (Excel files with multiple sheets)
    if '_sheetName' in columns:
        # Group by sheet name - this is the most logical separation
        sheet_groups = {}
        for row in table_data:
            sheet_name = str(row.get('_sheetName', 'Unknown'))
            if sheet_name not in sheet_groups:
                sheet_groups[sheet_name] = []
            sheet_groups[sheet_name].append(row)
        
        # Return sheet-based groups if we have multiple sheets
        if len(sheet_groups) > 1:
            return list(sheet_groups.values())
    
    # Strategy 2: Look for other potential grouping columns (category, type, department, etc.)
    grouping_candidates = []
    for col in columns:
        col_lower = col.lower()
        if any(keyword in col_lower for keyword in ['category', 'type', 'department', 'group', 'section', 'phase', 'status', 'priority']):
            grouping_candidates.append(col)
    
    # If we have grouping candidates, use the first one that gives good groups
    for grouping_column in grouping_candidates:
        groups = {}
        
        for row in table_data:
            group_key = str(row.get(grouping_column, 'Other'))
            if group_key not in groups:
                groups[group_key] = []
            groups[group_key].append(row)
        
        # Only return separate groups if we have 2-8 reasonable sized groups
        if 2 <= len(groups) <= 8 and all(len(group) >= 1 for group in groups.values()):
            # Check if grouping makes sense (not too fragmented)
            avg_group_size = len(table_data) / len(groups)
            if avg_group_size >= 2:  # At least 2 rows per group on average
                return list(groups.values())
    
    # Strategy 3: If data is large (>15 rows), chunk it into logical sizes
    if len(table_data) > 15:
        chunk_size = 10  # Smaller chunk size for better readability
        chunks = []
        for i in range(0, len(table_data), chunk_size):
            chunks.append(table_data[i:i + chunk_size])
        return chunks
    
    # Default: Return as single group
    return [table_data]

async def generate_multiple_tables_with_llm(request: FileTableRequest, table_groups: List[List[Dict]]) -> str:
    """
    Generate multiple separate tables from grouped data
    
    Args:
        request: FileTableRequest containing metadata
        table_groups: List of data groups, each becoming a separate table
        
    Returns:
        str: Markdown content with multiple tables
    """
    try:
        all_tables_content = []
        
        # Add notes if provided (but skip file metadata)
        if request.notes:
            notes_section = f"**Notes:** {request.notes}\n\n"
            all_tables_content.append(notes_section)
        
        # Generate each table separately
        for i, group_data in enumerate(table_groups, 1):
            if not group_data:
                continue
                
            columns = list(group_data[0].keys())
            
            # Determine table title/grouping info
            table_title = f"## Table {i}"
            grouping_info = ""
            
            # Try to identify what makes this group unique
            if len(table_groups) > 1:
                # Priority 1: Check for _sheetName (Excel sheets)
                if '_sheetName' in columns:
                    sheet_values = list(set(str(row.get('_sheetName', '')) for row in group_data))
                    if len(sheet_values) == 1 and sheet_values[0]:
                        table_title = f"## {sheet_values[0]} Data"
                        grouping_info = f"Data from sheet: {sheet_values[0]}"
                
                # Priority 2: Look for common values in other potential grouping columns
                elif not grouping_info:
                    for col in columns:
                        col_lower = col.lower()
                        if any(keyword in col_lower for keyword in ['category', 'type', 'department', 'group', 'status']):
                            values = list(set(str(row.get(col, '')) for row in group_data))
                            if len(values) == 1 and values[0]:
                                table_title = f"## {col}: {values[0]}"
                                grouping_info = f"Grouped by {col}: {values[0]}"
                                break
                            elif len(values) <= 3:
                                table_title = f"## {col}: {', '.join(values)}"
                                grouping_info = f"Grouped by {col}: {', '.join(values)}"
                                break
            
            # Format group data for LLM prompt
            sample_text = ""
            for j, row in enumerate(group_data[:10]):  # Show first 10 rows as sample
                sample_text += f"Row {j+1}: " + " | ".join([f"{col}: {row.get(col, '')}" for col in columns]) + "\n"
            
            # Create prompt for this specific table
            prompt = f"""Create a professional data table in markdown format for an RFP proposal.

Table Information:
- Columns: {', '.join(columns)}
- Rows in this table: {len(group_data)}
- Table Context: {grouping_info or 'Subset of data'}
- Remove metadata columns: Exclude _sheetName and _sheetIndex from the final table

Data for this table:
{sample_text}

Requirements:
- Use proper markdown table syntax with | separators
- Include clear column headers (exclude _sheetName and _sheetIndex columns)
- Format data appropriately (currency, dates, percentages as detected)
- Make it professional and suitable for business proposals
- Include ALL {len(group_data)} rows in the table
- Do NOT include title, description, or markdown code blocks
- Do NOT wrap in ```markdown or any code blocks
- Clean up column names (remove underscores, make them readable)
- Output raw markdown table only

Generate ONLY the raw markdown table with headers and data rows. No code blocks, no title, no description, just the clean table without metadata columns."""

            # Use Azure OpenAI to generate this specific table
            response = table_generation_client.chat.completions.create(
                model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4"),
                messages=[
                    {
                        "role": "system",
                        "content": "You are a data formatter. Create clean markdown tables with proper formatting. Return ONLY raw markdown table syntax without code blocks, titles, or descriptions. Never use ```markdown or any code block wrapper."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=2000,
                temperature=0.2
            )
            
            table_content = response.choices[0].message.content.strip()
            
            # Combine title with generated table
            complete_table = f"{table_title}\n\n{table_content}\n\n"
            all_tables_content.append(complete_table)
        
        return "".join(all_tables_content)
        
    except Exception as ex:
        telemetry_client.track_exception(ex)
        # Fallback to single table generation
        return await generate_single_table_with_llm(request)

async def generate_single_table_with_llm(request: FileTableRequest) -> str:
    """
    Generate a single professional table from file data
    
    Args:
        request: FileTableRequest containing table data and metadata
        
    Returns:
        str: Professional markdown formatted single table
    """
    try:
        columns = list(request.tableData[0].keys())
        rows_count = len(request.tableData)
        
        # Prepare sample data for the prompt (limit to first 10 rows for context)
        sample_data = request.tableData[:10]
        
        # Format sample data as text for the prompt
        sample_text = ""
        for i, row in enumerate(sample_data):
            sample_text += f"Row {i+1}:\n"
            for col, value in row.items():
                sample_text += f"  {col}: {value}\n"
            sample_text += "\n"
        
        # Create a detailed prompt for LLM
        prompt = f"""Create a professional data table in markdown format for an RFP proposal. The table should be well-structured, clear, and business-appropriate.

Table Information:
- Columns: {', '.join(columns)}
- Total Rows: {rows_count}
- Notes: {request.notes or 'No additional notes'}

Sample Data (first 10 rows):
{sample_text}

Requirements:
- Use proper markdown table syntax
- Include clear headers
- Make it look professional and suitable for business proposals
- Preserve all column information
- Format data appropriately (currency, dates, percentages as detected)
- Add appropriate spacing and formatting
- Do NOT include filename or record counts in title
- Do NOT wrap table in markdown code blocks
- Do NOT use ```markdown or any code block syntax
- Output clean markdown table format

Generate a complete, professional table section with:
1. A clear descriptive title (do NOT use filename)
2. Brief description of the data content
3. Well-formatted markdown table with all data
4. Summary or notes section if applicable
5. Professional presentation suitable for RFP responses

Requirements:
- Do NOT include filename or record counts in title
- Do NOT wrap table in markdown code blocks
- Do NOT use ```markdown or any code block syntax
- Output clean markdown table format
- Include ALL {rows_count} rows of data in the table

Make sure the table is properly formatted and easy to read."""

        # Use Azure OpenAI to generate the table
        response = table_generation_client.chat.completions.create(
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4"),
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional business proposal writer. Create clear, well-structured data tables in markdown format that are suitable for RFP responses. Focus on clarity, professionalism, and proper formatting. Never use code blocks like ```markdown. Always include ALL provided data rows in the table."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=4000,
            temperature=0.3
        )
        
        generated_content = response.choices[0].message.content.strip()
        return generated_content
        
    except Exception as ex:
        # Fallback to manual table generation if LLM fails
        telemetry_client.track_exception(ex)
        return generate_fallback_file_table(request)

def generate_fallback_file_table(request: FileTableRequest) -> str:
    """
    Generate a basic file table as fallback if LLM generation fails
    
    Args:
        request: FileTableRequest containing table data
        
    Returns:
        str: Basic markdown formatted table
    """
    if not request.tableData or len(request.tableData) == 0:
        return "## Data Table\n\nNo data available to display."
    
    # Get column headers (exclude metadata columns)
    columns = [col for col in request.tableData[0].keys() if not col.startswith('_')]
    
    # Start building the table without filename metadata
    table_title = "## Data Table\n\n"
    
    if request.notes:
        table_title += f"**Notes:** {request.notes}\n\n"
    
    table_content = table_title
    
    # Create header row
    header_row = "| " + " | ".join(columns) + " |\n"
    separator_row = "|" + "|".join(["---" for _ in columns]) + "|\n"
    
    table_content += header_row + separator_row
    
    # Add data rows (exclude metadata columns)
    for row in request.tableData:
        data_row = "| " + " | ".join([str(row.get(col, "")) for col in columns]) + " |\n"
        table_content += data_row
    
    return table_content