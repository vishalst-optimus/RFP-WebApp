"""
Pricing Table Generation Service - Handles pricing table generation and processing
"""
from typing import List
from openai import AzureOpenAI
import os
from pydantic import BaseModel
from application.services.logging_service.logging import telemetry_client

class PricingTableItem(BaseModel):
    id: str
    category: str
    description: str
    quantity: int
    unitPrice: float
    total: float

class PricingTableRequest(BaseModel):
    rfpName: str
    sessionId: str
    selectedSections: List[str] = None
    currency: str
    items: List[PricingTableItem]
    subtotal: float
    taxRate: float
    tax: float
    total: float
    notes: str = None
    sectionName: str = None  # Custom section name when creating new section

# Azure OpenAI client setup for pricing table generation
pricing_generation_client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)

async def generate_pricing_table_with_llm(request: PricingTableRequest) -> str:
    """
    Generate a professional pricing table using LLM with proper markdown formatting
    
    Args:
        request: PricingTableRequest containing pricing data
        
    Returns:
        str: Professional markdown formatted pricing table
    """
    try:
        # Prepare items data for the prompt
        items_text = ""
        for item in request.items:
            items_text += f"- Category: {item.category}, Description: {item.description}, Quantity: {item.quantity}, Unit Price: {request.currency} {item.unitPrice:.2f}, Total: {request.currency} {item.total:.2f}\n"
        
        # Create a detailed prompt for LLM
        prompt = f"""Create a professional pricing table in markdown format for an RFP proposal. The table should be well-structured, clear, and business-appropriate.

Requirements:
- Use proper markdown table syntax
- Include clear headers
- Format currency as {request.currency}
- Make it look professional and suitable for business proposals
- Include all financial calculations
- Add appropriate spacing and formatting

Pricing Information:
{items_text}

Financial Summary:
- Subtotal: {request.currency} {request.subtotal:.2f}
- Tax Rate: {request.taxRate}%
- Tax Amount: {request.currency} {request.tax:.2f}
- Total Amount: {request.currency} {request.total:.2f}

Generate a complete, professional pricing table section with:
1. A clear title
2. Well-formatted table with all items
3. Summary section with totals
4. Professional presentation suitable for RFP responses

Make sure the table is properly formatted and easy to read."""

        # Use Azure OpenAI to generate the table
        response = pricing_generation_client.chat.completions.create(
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4"),
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional business proposal writer. Create clear, well-structured pricing tables in markdown format that are suitable for RFP responses. Focus on clarity, professionalism, and proper formatting."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=2000,
            temperature=0.3
        )
        
        generated_content = response.choices[0].message.content.strip()
        return generated_content
        
    except Exception as ex:
        # Fallback to manual table generation if LLM fails
        telemetry_client.track_exception(ex)
        return generate_fallback_pricing_table(request)

def generate_fallback_pricing_table(request: PricingTableRequest) -> str:
    """
    Generate a basic pricing table as fallback if LLM generation fails
    
    Args:
        request: PricingTableRequest containing pricing data
        
    Returns:
        str: Basic markdown formatted pricing table
    """
    table_content = f"""# Pricing Table

## Cost Breakdown

| Category | Description | Quantity | Unit Price | Total |
|----------|-------------|----------|------------|-------|"""
    
    # Add items to table
    for item in request.items:
        table_content += f"\n| {item.category} | {item.description} | {item.quantity} | {request.currency} {item.unitPrice:.2f} | {request.currency} {item.total:.2f} |"
    
    # Add summary
    table_content += f"""

## Financial Summary

| Description | Amount |
|-------------|--------|
| Subtotal | {request.currency} {request.subtotal:.2f} |
| Tax ({request.taxRate}%) | {request.currency} {request.tax:.2f} |
| **Total** | **{request.currency} {request.total:.2f}** |"""
    
    return table_content