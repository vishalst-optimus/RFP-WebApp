
from datetime import datetime, timedelta
import json
import os
from typing import List

from dotenv import load_dotenv
from fastapi import requests

load_dotenv()

def extract_from_document_index(adi_result_object) -> List[str]:
    """
    Extract sections from the document's own index/table of contents if available.
    Returns list of section names or empty list if no index found.
    """
    print("🔍 Scanning document structure for index/table of contents...")
    
    if not hasattr(adi_result_object, 'paragraphs'):
        print("❌ No paragraphs available in document object")
        return []
    
    sections = []
    in_index_section = False
    index_indicators = [
        'table of contents',
        'contents',
        'index',
        'table of content',
        'section index',
        'document outline'
    ]
    
    # Keywords that indicate we're still in table of contents
    toc_continuation_indicators = [
        'page', 'section', 'chapter', 'part', 'appendix'
    ]
    
    # Track if we've found an index section
    found_index = False
    consecutive_page_numbers = 0
    
    for i, paragraph in enumerate(adi_result_object.paragraphs):
        if not hasattr(paragraph, 'content') or not paragraph.content:
            continue
            
        content = paragraph.content.strip()
        content_lower = content.lower()
        
        # Check if this looks like a table of contents header
        if any(indicator in content_lower for indicator in index_indicators):
            in_index_section = True
            found_index = True
            consecutive_page_numbers = 0
            print(f"📋 Found index section: {content}")
            continue
            
        # If we're in index section, extract section names
        if in_index_section and content:
            import re
            
            # Skip obvious headers and page references
            if (content_lower.startswith(('page', 'section', 'chapter')) and 
                len(content.split()) <= 3):
                continue
                
            # Look for patterns that indicate TOC entries:
            # "Section Name ..................... 15"
            # "1. Section Name .................. 15" 
            # "Chapter 1: Section Name .......... 15"
            
            # Remove page number patterns at the end
            cleaned_content = re.sub(r'\.{3,}\s*\d+\s*$', '', content)  # Remove dots and page numbers
            cleaned_content = re.sub(r'\s+\d+\s*$', '', cleaned_content)  # Remove trailing page numbers
            cleaned_content = re.sub(r'\s*\.\.\.\s*$', '', cleaned_content)  # Remove trailing dots
            cleaned_content = cleaned_content.strip()
            
            # Extract section name from numbered entries
            section_match = re.match(r'^(?:\d+\.?\s*|[A-Z]\.?\s*|Chapter\s+\d+:?\s*|Section\s+\d+:?\s*|Part\s+[IVX]+:?\s*)?(.+)$', 
                                   cleaned_content, re.IGNORECASE)
            
            if section_match:
                section_name = section_match.group(1).strip()
                
                # Additional filtering to exclude headers and format indicators
                exclude_headers = [
                    'proposal format', 'submission requirements', 'response format',
                    'proposal structure', 'submission guidelines', 'table of contents',
                    'contents', 'index', 'instructions to bidders', 'instructions to proposers',
                    'evaluation criteria', 'proposal evaluation', 'submission format'
                ]
                
                # Filter out obvious non-sections
                if (len(section_name) > 3 and 
                    len(section_name) < 100 and
                    section_name not in sections and
                    not section_name.lower().startswith(('page', 'continued', 'end of', 'table of')) and
                    not any(header in section_name.lower() for header in exclude_headers) and
                    not re.match(r'^\d+$', section_name) and  # Not just a number
                    section_name != content):  # Avoid duplicates
                    
                    sections.append(section_name)
                    print(f"   ✅ Added from index: {section_name}")
                    consecutive_page_numbers = 0
            
            # Check if we're seeing too many page numbers (might have left TOC)
            if re.match(r'^\d+$', content.strip()):
                consecutive_page_numbers += 1
                if consecutive_page_numbers > 3:
                    print("🚪 Exiting index section - too many consecutive page numbers")
                    break
            else:
                consecutive_page_numbers = 0
                
            # Exit conditions for leaving TOC
            if (len(content) > 200 or  # Very long content usually not TOC
                (not any(indicator in content_lower for indicator in toc_continuation_indicators) and 
                 len(content.split()) > 10 and
                 not '.' in content[-20:])):  # No dots or page refs at end
                
                # Check if next few paragraphs look like regular content
                next_paragraphs_content = True
                for j in range(i + 1, min(i + 4, len(adi_result_object.paragraphs))):
                    if hasattr(adi_result_object.paragraphs[j], 'content'):
                        next_content = adi_result_object.paragraphs[j].content.strip()
                        if (len(next_content) > 50 and 
                            not any(ind in next_content.lower() for ind in toc_continuation_indicators)):
                            print("🚪 Exiting index section - reached main content")
                            in_index_section = False
                            break
    
    if found_index and sections:
        print(f"✅ Successfully extracted {len(sections)} sections from document index")
        return sections
    elif found_index and not sections:
        print("⚠️ Found index section but could not extract section names")
        return []
    else:
        print("❌ No table of contents/index found in document")
        return []


async def extract_all_rfp_sections_generic(document_content: str) -> List[str]:
    """
    Generic RFP section extraction that searches for proposal format requirements within document content.
    Does NOT rely on table of contents or index pages - searches actual content.
    """
    try:
        endpoint = os.environ["AZURE_OPENAI_ENDPOINT"]
        key = os.environ["AZURE_OPENAI_KEY"]
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")
        api_version = "2024-10-21"
        
        # Enhanced content-based extraction prompt
        extraction_prompt = f"""You are an expert document analyzer. Your task is to find proposal format requirements within the document content itself, NOT from table of contents or index pages.

DOCUMENT CONTENT TO ANALYZE:
{document_content[:30000]}

SEARCH STRATEGY:
1. Look for sections with headings like:
   - "Proposal Format"
   - "Submission Requirements" 
   - "Response Format"
   - "Proposal Structure"
   - "Submission Guidelines"
   - "Instructions to Bidders/Proposers"
   - "Evaluation Criteria" (often lists what sections will be evaluated)

2. Within those sections, find lists that specify what vendors must include in their proposals

3. IGNORE:
   - Table of contents or index pages with page numbers
   - Document navigation structures
   - Project work breakdown or deliverables
   - Technical specifications or requirements (focus on PROPOSAL ORGANIZATION)

4. EXTRACT section names that describe how to organize the PROPOSAL DOCUMENT, such as:
   ✅ "Cover Letter" 
   ✅ "Company Overview"
   ✅ "Technical Approach"
   ✅ "Project Plan"
   ✅ "Pricing Schedule"
   ✅ "References"

5. Use EXACT wording from the document

SEARCH PATTERNS TO LOOK FOR:
- "Your proposal must include:"
- "Proposals should contain the following:"
- "The submission must include:"
- "Required proposal sections:"
- "Organize your response as follows:"
- "Proposal format requirements:"
- Lists following phrases like "Submit the following information:"

CRITICAL: Search the CONTENT of the document for these patterns, not just headers or indices.

Return JSON with found sections:
{{
  "found_sections": [
    "Section Name 1",
    "Section Name 2"
  ],
  "source_context": "Brief description of where these were found (e.g., 'Found in Proposal Format section on page X')",
  "search_success": true/false
}}

If no proposal format requirements are found in the content, return:
{{
  "found_sections": [],
  "source_context": "No proposal format requirements found in document content",
  "search_success": false
}}"""

        messages = [{"role": "user", "content": extraction_prompt}]
        
        url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
        headers = {"api-key": key, "Content-Type": "application/json"}
        payload = {
            "messages": messages,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "max_tokens": 2000
        }
        
        print("🔍 Searching document content for proposal format requirements...")
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        
        if response.status_code == 200:
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            
            try:
                data = json.loads(content)
                sections = data.get('found_sections', [])
                source_context = data.get('source_context', 'Unknown source')
                search_success = data.get('search_success', False)
                
                print(f"📋 Content-based extraction results:")
                print(f"   🎯 Search successful: {search_success}")
                print(f"   📍 Source: {source_context}")
                print(f"   📋 Sections found: {len(sections)}")
                
                if sections:
                    for i, section in enumerate(sections):
                        print(f"      {i+1}. {section}")
                else:
                    print("   ❌ No sections found in document content")
                
                if search_success and sections:
                    return sections
                else:
                    print("🔄 No content-based sections found, trying pattern-based extraction...")
                    return await pattern_based_extraction(document_content)
                
            except json.JSONDecodeError as e:
                print(f"❌ JSON parse error: {e}")
                return await pattern_based_extraction(document_content)
                
        else:
            print(f"❌ API error: {response.status_code}")
            return await pattern_based_extraction(document_content)
            
    except Exception as e:
        print(f"❌ Error in content extraction: {e}")
        return await pattern_based_extraction(document_content)


async def pattern_based_extraction(document_content: str) -> List[str]:
    """
    Fallback extraction using text patterns when LLM content search fails.
    """
    print("🔄 Using pattern-based extraction...")
    
    sections = []
    lines = document_content.split('\n')
    
    # Keywords that indicate we're in a proposal format section
    proposal_format_indicators = [
        'proposal format',
        'submission requirements',
        'response format', 
        'proposal structure',
        'submission guidelines',
        'instructions to bidders',
        'instructions to proposers',
        'evaluation criteria',
        'proposal evaluation',
        'submission format',
        'required proposal',
        'proposal organization'
    ]
    
    # Phrases that indicate section lists
    section_list_indicators = [
        'proposal must include',
        'proposal should contain',
        'submission must include',
        'response must include',
        'your proposal should include',
        'submit the following',
        'provide the following',
        'include the following',
        'organize your response',
        'required sections',
        'proposal sections'
    ]
    
    # Words to exclude (project work, not proposal structure)
    exclude_terms = [
        'design', 'installation', 'testing', 'programming', 'mapping', 
        'removal', 'licensing', 'training', 'implementation', 'deployment',
        'maintenance', 'support', 'monitoring', 'configuration'
    ]
    
    in_proposal_section = False
    in_section_list = False
    proposal_section_depth = 0
    
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        line_lower = line_stripped.lower()
        
        # Check if we're entering a proposal format section
        if any(indicator in line_lower for indicator in proposal_format_indicators):
            in_proposal_section = True
            proposal_section_depth = 0
            print(f"📋 Found proposal format section: {line_stripped}")
            continue
            
        # Check if we're entering a section list within proposal format
        if in_proposal_section and any(indicator in line_lower for indicator in section_list_indicators):
            in_section_list = True
            print(f"📝 Found section list indicator: {line_stripped}")
            continue
            
        # Exit proposal section if we hit a major new section
        if (line_stripped.startswith(('PART ', 'SECTION ', 'CHAPTER ')) or
            (len(line_stripped) > 0 and line_stripped.isupper() and len(line_stripped) < 50)):
            if in_proposal_section:
                proposal_section_depth += 1
                if proposal_section_depth > 2:  # Allow some depth before exiting
                    in_proposal_section = False
                    in_section_list = False
                    print(f"🚪 Exiting proposal section at: {line_stripped}")
            
        # Extract sections if we're in the right context
        if in_section_list and line_stripped:
            import re
            
            # Look for numbered or bulleted items
            patterns = [
                r'^[\d]+\.?\s*(.+)$',           # 1. Section Name or 1 Section Name
                r'^[a-zA-Z]\.?\s*(.+)$',        # a. Section Name or a Section Name  
                r'^\•\s*(.+)$',                 # • Section Name
                r'^\-\s*(.+)$',                 # - Section Name
                r'^\*\s*(.+)$',                 # * Section Name
                r'^o\s*(.+)$',                  # o Section Name
            ]
            
            for pattern in patterns:
                match = re.match(pattern, line_stripped)
                if match:
                    section_name = match.group(1).strip()
                    
                    # Clean up section name
                    section_name = re.sub(r'\.+$', '', section_name)  # Remove trailing dots
                    section_name = re.sub(r'\s*\(\d+\s*points?\).*$', '', section_name)  # Remove point values
                    section_name = section_name.strip()
                    
                    # Filter out obvious non-sections
                    if (len(section_name) > 3 and 
                        len(section_name) < 100 and
                        section_name not in sections and
                        not section_name.lower().startswith('page') and
                        not any(exclude in section_name.lower() for exclude in exclude_terms) and
                        not re.match(r'^\d+$', section_name)):  # Not just a number
                        
                        sections.append(section_name)
                        print(f"   ✅ Added: {section_name}")
                    break
    
    # If no sections found, try to extract from evaluation criteria
    if not sections:
        print("🔍 Trying evaluation criteria extraction...")
        sections = extract_from_evaluation_sections(lines)
    
    # Final fallback only if absolutely nothing found
    if not sections:
        print("⚠️ Using minimal fallback sections")
        sections = [
            "Cover Letter",
            "Company Overview", 
            "Technical Approach",
            "Pricing Information"
        ]
    
    print(f"📊 Pattern extraction found {len(sections)} sections")
    return sections


def extract_from_evaluation_sections(lines: List[str]) -> List[str]:
    """
    Extract proposal sections from evaluation criteria sections.
    """
    sections = []
    in_evaluation = False
    
    evaluation_indicators = [
        'evaluation criteria',
        'scoring criteria', 
        'proposal evaluation',
        'evaluation factors',
        'selection criteria'
    ]
    
    for line in lines:
        line_lower = line.lower().strip()
        
        # Look for evaluation sections
        if any(indicator in line_lower for indicator in evaluation_indicators):
            in_evaluation = True
            print(f"📊 Found evaluation section: {line.strip()}")
            continue
            
        # Exit if we hit a new major section
        if line.strip().startswith(('PART ', 'SECTION ', 'CHAPTER ')):
            in_evaluation = False
            continue
            
        if in_evaluation and line.strip():
            # Look for sections mentioned in evaluation context
            import re
            
            # Common proposal section terms in evaluation contexts
            section_terms = [
                'cover letter', 'executive summary', 'company overview', 'company profile',
                'technical approach', 'methodology', 'project plan', 'implementation',
                'pricing', 'cost', 'budget', 'schedule', 'timeline', 
                'experience', 'qualifications', 'references', 'past performance',
                'team', 'personnel', 'staffing', 'capabilities'
            ]
            
            for term in section_terms:
                if term in line_lower and term not in [s.lower() for s in sections]:
                    # Convert to proper title case
                    section_name = ' '.join(word.capitalize() for word in term.split())
                    if section_name not in sections:
                        sections.append(section_name)
                        print(f"   ✅ Added from evaluation: {section_name}")
    
    return sections

# Pacific Time (PST/PDT) - UTC-8 (PST) or UTC-7 (PDT)
def get_pacific_time():
    """Get current time in Pacific Time (PST/PDT)"""
    # Pacific Time: UTC-8 in winter (PST), UTC-7 in summer (PDT)
    # We'll use a simple approximation - typically PDT from March to November
    utc_now = datetime.datetime.utcnow()
    
    # Determine if it's daylight saving time (approximate)
    # PDT typically runs from 2nd Sunday in March to 1st Sunday in November
    year = utc_now.year
    
    # 2nd Sunday in March
    march_dst_start = datetime.datetime(year, 3, 8)
    while march_dst_start.weekday() != 6:  # 6 = Sunday
        march_dst_start += timedelta(days=1)
    
    # 1st Sunday in November  
    nov_dst_end = datetime.datetime(year, 11, 1)
    while nov_dst_end.weekday() != 6:  # 6 = Sunday
        nov_dst_end += timedelta(days=1)
    
    # Check if current date is in PDT period
    if march_dst_start <= utc_now.replace(hour=0, minute=0, second=0, microsecond=0) < nov_dst_end:
        # PDT: UTC-7
        pacific_time = utc_now - timedelta(hours=7)
        timezone_suffix = " PDT"
    else:
        # PST: UTC-8
        pacific_time = utc_now - timedelta(hours=8)
        timezone_suffix = " PST"
    
    return pacific_time, timezone_suffix
