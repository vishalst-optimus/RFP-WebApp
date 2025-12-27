from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
import io, time, re
import os
import requests

# Import telemetry for logging
try:
    from application.services.logging_service.logging import telemetry_client
except ImportError:
    # Fallback if telemetry is not available
    class MockTelemetryClient:
        def track_event(self, event_name, properties=None):
            pass
    telemetry_client = MockTelemetryClient()

# ---------------------------
# LLM Enhancement Function
# ---------------------------
def enhance_section_content_with_llm(section_title: str, section_content: str) -> str:
    """
    Enhance section content using Azure OpenAI for better formatting and professional tone.
    Preserves user's content choices and length.
    """
    try:
        # Check if content is already well-formatted or too short to enhance
        if not section_content or len(section_content.strip()) < 20:
            return section_content
        
        # Store original length for validation
        original_length = len(section_content.strip())
        
        # Use dedicated formatting deployment
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        key = os.environ.get("AZURE_OPENAI_KEY")
        
        if not endpoint or not key:
            print("Azure OpenAI credentials not available, skipping enhancement")
            return section_content
            
        deployment = os.environ.get("AZURE_OPENAI_FORMATTING_DEPLOYMENT_NAME", "gpt-4o-mini")
        api_version = "2024-10-21"
        
        formatting_prompt = f"""
You are a professional document formatter. Your task is to enhance the following section content for a formal RFP response document while preserving the user's content choices and length.

Section Title: {section_title}

Original Content:
{section_content}

Please enhance this content by ONLY:
1. Improving clarity and professional tone without changing the content length significantly
2. Ensuring logical flow and coherence within the existing content structure
3. Maintaining all technical details and specifics exactly as provided
4. Using professional business language while keeping the same content scope
5. Improving sentence structure and grammar without expanding content
6. Adding bullet points or numbered lists ONLY if the original content suggests such formatting
7. Removing any redundant or repetitive information

CRITICAL INSTRUCTIONS:
- Do NOT add any headings, subheadings, or section titles to the content
- Do NOT repeat the section title "{section_title}" anywhere in your response
- Do NOT add introductory phrases like "This section covers...", "Overview:", etc.
- Do NOT expand the content beyond the scope of what was originally provided
- Do NOT add new information or elaborate beyond what's already there
- PRESERVE the content length - if the original is short, keep it short
- RESPECT user editing choices - if content was shortened, maintain that brevity
- Use plain text formatting (no markdown symbols like **, *, etc.)
- Return only the polished version of the exact content provided
- Focus solely on improving readability and professional tone of existing content

Return only the enhanced content without any additional commentary, headers, or structural additions.
The output should be directly usable as paragraph content in a Word document.
"""
        
        messages = [
            {"role": "system", "content": "You are a professional document formatter who creates clear, well-structured business content with excellent readability."},
            {"role": "user", "content": formatting_prompt}
        ]
        
        url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
        headers = {"api-key": key, "Content-Type": "application/json"}
        payload = {
            "messages": messages, 
            "temperature": 0.2,  # Lower temperature for consistency
            "max_tokens": 2000
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        
        result = response.json()
        enhanced_content = result["choices"][0]["message"]["content"].strip()
        
        # Validate that enhancement doesn't dramatically expand short content
        enhanced_length = len(enhanced_content)
        expansion_ratio = enhanced_length / original_length if original_length > 0 else 1
        
        # If content was short and got expanded too much, use original instead
        if original_length < 200 and expansion_ratio > 3.0:
            print(f"⚠️ Section '{section_title}' - Enhanced content expanded too much ({original_length} → {enhanced_length} chars, ratio: {expansion_ratio:.1f}x)")
            print("📄 Using original content to preserve user's editing choices")
            
            # Track expansion rejection
            telemetry_client.track_event("DocGen_Enhancement_Rejected", {
                "section_title": section_title,
                "original_length": original_length,
                "enhanced_length": enhanced_length,
                "expansion_ratio": round(expansion_ratio, 2),
                "reason": "excessive_expansion"
            })
            
            return section_content
        
        # Track successful enhancement
        telemetry_client.track_event("DocGen_Content_Enhanced", {
            "section_title": section_title,
            "original_length": original_length,
            "enhanced_length": enhanced_length,
            "expansion_ratio": round(expansion_ratio, 2),
            "deployment": deployment
        })
        
        print(f"✅ Enhanced content for section '{section_title}' using Azure OpenAI ({original_length} → {enhanced_length} chars)")
        return enhanced_content
        
    except Exception as e:
        # Track enhancement failures
        telemetry_client.track_event("DocGen_Enhancement_Error", {
            "section_title": section_title,
            "error": str(e)
        })
        
        print(f"⚠️ Error enhancing content for section '{section_title}': {str(e)}")
        print("📄 Using original content without enhancement")
        return section_content

# ---------------------------
# Helper functions
# ---------------------------
def strip_section_number(section_title: str) -> str:
    """Remove existing numbers from section title (like '3.2 Table of Contents' becomes 'Table of Contents')."""
    import re
    # Remove leading digits, dots, and spaces pattern
    pattern = r'^\d+(\.\d+)*\s*\.?\s*'
    cleaned_title = re.sub(pattern, '', section_title.strip())
    return cleaned_title.strip()

def is_table_of_contents_section(section_title: str, section_content: str = "") -> bool:
    """
    Check if a section is a table of contents by analyzing the title.
    Uses conservative detection to avoid false positives.
    """
    clean_title = strip_section_number(section_title).lower().strip()
    
    # Very specific title matches - only exact matches for common TOC names
    exact_toc_titles = [
        'table of contents',
        'table of content',
        'contents',
        'index'
    ]
    
    # Simple: if the clean title matches exactly, it's a TOC section
    # We don't need complex content analysis since titles like "Table of Contents" are pretty unambiguous
    return clean_title in exact_toc_titles

# ---------------------------
# Formatting helpers
# ---------------------------
def format_heading(paragraph, font_size=16, bold=True):
    for run in paragraph.runs:
        run.font.name = "Calibri"
        run.font.size = Pt(font_size)
        run.font.bold = bold

def format_paragraph(paragraph, font_size=12, bold=False, italic=False):
    for run in paragraph.runs:
        run.font.name = "Calibri"
        run.font.size = Pt(font_size)
        run.font.bold = bold
        run.font.italic = italic

# ---------------------------
# Markdown cleanup helpers
# ---------------------------
def clean_markdown(text: str) -> str:
    """Remove markdown symbols while preserving text."""
    text = re.sub(r'^---$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    text = re.sub(r'^\s*#{1,6}\s*', '', text, flags=re.MULTILINE)
    return text.strip()


def add_content(doc: Document, content: str, section_title: str = ""):
    """Add content with bullet/number list handling, avoiding duplicates and stripping leading numbers."""
    cleaned = clean_markdown(content)
    seen_lines = set()
    
    for para in cleaned.split("\n"):
        line = para.strip()
        if not line:
            continue

        line = re.sub(r'^\d+\.\s*', '', line)

        norm_line = line.lower()
        if section_title and norm_line == section_title.lower():
            continue
        if norm_line in seen_lines:
            continue
        seen_lines.add(norm_line)

        if line.startswith("- "):
            p = doc.add_paragraph(line[2:], style="List Bullet")
            format_paragraph(p)
        elif re.match(r'^\d+\.\s', line):
            text = re.sub(r'^\d+\.\s*', "", line)
            p = doc.add_paragraph(text, style="List Number")
            format_paragraph(p)
        else:
            p = doc.add_paragraph(line)
            format_paragraph(p)

def create_docx_from_sections(rfp_data: dict) -> io.BytesIO:
    """
    Create a professional Word document from RFP data with AI-enhanced content.
    """
    start_time = time.time()
    
    try:
        doc = Document()
        sections = rfp_data.get("sections", {})
        
        # Track document generation start
        telemetry_client.track_event("DocGen_Started", {
            "total_sections": len(sections),
            "total_content_length": sum(len(section.get("content", "")) for section in sections.values())
        })

        # -------- Title Page --------
        title_text = "RFP Response Proposal"
        title = doc.add_heading(title_text, 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        format_heading(title, font_size=22)

        metadata = rfp_data.get("metadata", {})
        doc.add_paragraph(f"Document Type: {metadata.get('document_type', 'RFP Response')}")
        doc.add_paragraph(f"Analysis Date: {metadata.get('analysis_date', 'N/A')}")
        doc.add_paragraph(f"Total Sections: {metadata.get('total_sections', 'N/A')}")
        doc.add_paragraph(f"Source Document: {metadata.get('file_name', 'Unknown')}")
        doc.add_page_break()

        # -------- Table of Contents --------
        # Filter out Table of Contents, Index, and similar navigation sections from TOC listing
        filtered_sections_for_toc = {
            title: section for title, section in sections.items()
            if not is_table_of_contents_section(title, section.get("content", ""))
        }
        
        toc_heading = doc.add_heading("Table of Contents", level=1)
        toc_heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
        format_heading(toc_heading, font_size=18)

        toc_number = 1
        for section_title in filtered_sections_for_toc.keys():
            # Strip any existing numbers and apply fresh numbering
            clean_title = strip_section_number(section_title)
            p = doc.add_paragraph(f"{toc_number}. {clean_title}")
            format_paragraph(p, font_size=12)
            toc_number += 1

        doc.add_page_break()

        # -------- Sections --------
        # Filter out Table of Contents, Index, and similar navigation sections since TOC is auto-generated
        filtered_sections = {
            title: section for title, section in sections.items()
            if not is_table_of_contents_section(title, section.get("content", ""))
        }
        
        # Log which sections were filtered out
        filtered_out_sections = [title for title, section in sections.items() if is_table_of_contents_section(title, section.get("content", ""))]
        if filtered_out_sections:
            print(f"📋 Filtered out TOC-like sections: {filtered_out_sections}")
        else:
            print("📋 No TOC sections detected for filtering")
        print(f"📋 Processing {len(filtered_sections)} sections (was {len(sections)})")
        
        section_number = 1
        enhanced_sections = 0
        total_original_length = 0
        total_enhanced_length = 0
        
        for section_title, section in filtered_sections.items():
            print(f"🔄 Processing section {section_number}: {section_title}")
            
            # Strip existing numbers and apply fresh sequential numbering
            clean_title = strip_section_number(section_title)
            heading = doc.add_heading(f"{section_number}. {clean_title}", level=1)
            format_heading(heading, font_size=16)

            # Get and enhance section content using LLM
            raw_content = section.get("content", "").strip()
            
            if raw_content and raw_content != "[No content available]":
                # Check if AI enhancement is enabled (default: true)
                enable_ai_enhancement = os.environ.get("ENABLE_AI_CONTENT_ENHANCEMENT", "true").lower() == "true"
                
                if enable_ai_enhancement:
                    print(f"🤖 Enhancing content for section '{section_title}' with AI...")
                    original_length = len(raw_content)
                    enhanced_content = enhance_section_content_with_llm(section_title, raw_content)
                    
                    if enhanced_content and enhanced_content != raw_content:
                        content = enhanced_content
                        enhanced_sections += 1
                        total_original_length += original_length
                        total_enhanced_length += len(enhanced_content)
                        print(f"📈 Section '{section_title}' enhanced: {original_length} → {len(enhanced_content)} chars")
                    else:
                        content = raw_content
                        total_original_length += original_length
                        total_enhanced_length += original_length
                        print(f"📄 Section '{section_title}' - using original content")
                else:
                    content = raw_content
                    total_original_length += len(raw_content)
                    total_enhanced_length += len(raw_content)
                    print(f"⏭️ AI enhancement disabled - using original content for '{section_title}'")
            else:
                content = "[No content available]"
                
            add_content(doc, content, section_title=section_title)

            section_number += 1
            doc.add_page_break()

        # -------- Footer --------
        footer = doc.sections[0].footer.paragraphs[0]
        footer.text = f"Generated by RFP Analyzer System - {time.strftime('%Y-%m-%d %H:%M:%S')}"
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        format_paragraph(footer, font_size=10)

        buffer = io.BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # Track successful completion
        telemetry_client.track_event("DocGen_Completed", {
            "total_sections": len(sections),
            "enhanced_sections": enhanced_sections,
            "processing_time_seconds": round(processing_time, 2),
            "document_size_bytes": len(buffer.getvalue()),
            "total_original_content_length": total_original_length,
            "total_enhanced_content_length": total_enhanced_length,
            "enhancement_ratio": round(total_enhanced_length / total_original_length, 2) if total_original_length > 0 else 1.0
        })
        
        print(f"✅ Document generation completed in {processing_time:.2f}s")
        print(f"📊 Enhanced {enhanced_sections}/{len(sections)} sections")
        print(f"📄 Document size: {len(buffer.getvalue())} bytes")
        
        return buffer
        
    except Exception as e:
        # Track failures
        telemetry_client.track_event("DocGen_Error", {
            "error": str(e),
            "processing_time_seconds": round(time.time() - start_time, 2)
        })
        
        print(f"❌ Error creating document: {str(e)}")
        raise e

