import os
import time
import json
from typing import Dict, List, Any
import requests
from common.prompts.prompts import toc_prompt, condense_prompt, extract_prompt
from core.models.config import AzureOpenAIConfig
from dotenv import load_dotenv
load_dotenv()

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
AZURE_OPENAI_VERSION = os.getenv("AZURE_OPENAI_API_VERSION")

def get_response_structure_requirements(adi_result_object):
    """
    LLM-only two-step pipeline (condense entire doc -> extract required response TOC).
    Returns a string (proponent_toc) compatible with the original function:
      - If extraction succeeds: returns the JSON string the model produced (e.g. {"items":[...],"raw":"..."})
      - If no TOC found: returns the exact message "No required response TOC found - client did not specify mandatory proposal structure for proponents."
      - On error: returns an explanatory string (kept short).
    """

    full_document_content = getattr(adi_result_object, "content", "") or ""
    print(f"MAJOR STEP: Analyzing full document ({len(full_document_content):,} characters) for REQUIRED PROPONENT TOC...")
    if not full_document_content.strip():
        print("Document is empty.")
        return "No required response TOC found - client did not specify mandatory proposal structure for proponents."

    # Azure OpenAI configuration using Pydantic model
    config = AzureOpenAIConfig.from_env()

    if not config.endpoint or not config.api_key:
        err_msg = "Azure OpenAI endpoint or key not set in environment."
        print(err_msg)
        return err_msg

    def _call_azure(messages, max_tokens=2000, timeout=60):
        url = f"{config.endpoint}/openai/deployments/{config.deployment_name}/chat/completions?api-version={config.api_version}"
        headers = {"api-key": config.api_key, "Content-Type": "application/json"}
        payload = {"messages": messages, "temperature": 0.0, "max_tokens": max_tokens}
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    # ========== STEP 1: Condense entire document while preserving verbatim submission requirement passages ==========
    condense_chars = 20000
    condense_messages = [
        {"role": "system", "content": "You are a concise condensing assistant."},
        {"role": "user", "content": condense_prompt + "\n\nFULL DOCUMENT:\n" + full_document_content}
    ]

    max_condense_attempts = 2
    condensed = None
    for attempt in range(1, max_condense_attempts + 1):
        try:
            print(f"Condense attempt {attempt}...")
            condensed = _call_azure(condense_messages, max_tokens=2500, timeout=90)
            if condensed and isinstance(condensed, str) and len(condensed.strip()) > 0:
                condensed = condensed.strip()
                print(f"Condensed length: {len(condensed):,} characters.")
                if len(condensed) > condense_chars and attempt < max_condense_attempts:
                    condense_messages[1]["content"] = condense_prompt + (
                        "\n\nIMPORTANT: The condensed output MUST be at most "
                        f"{condense_chars} characters. Preserve verbatim requirement passages; summarize everything else.\n\nFULL DOCUMENT:\n"
                        + full_document_content
                    )
                    time.sleep(0.8 * attempt)
                    continue
                break
            else:
                raise ValueError("Empty condense response")
        except Exception as e:
            print(f"Condense attempt {attempt} error: {e}")
            if attempt < max_condense_attempts:
                time.sleep(1.0 * attempt)
                continue
            else:
                return f"Error during condense step: {e}"

    if not condensed:
        return "No required response TOC found - client did not specify mandatory proposal structure for proponents."

    # ========== STEP 2: Strict extraction from condensed text (LLM-only), JSON-only response ==========
    extract_instruction = (
        toc_prompt.strip()
        + extract_prompt.strip()
    )

    extract_messages = [
        {"role": "system", "content": "You are a precise extractor. Return only the JSON requested."},
        {"role": "user", "content": extract_instruction + "\n\nCondensed document:\n" + condensed}
    ]

    max_extract_attempts = 3
    model_raw = None
    parsed_items = []
    parsed_raw_passage = ""
    for attempt in range(1, max_extract_attempts + 1):
        try:
            print(f"Extract attempt {attempt}...")
            model_resp = _call_azure(extract_messages, max_tokens=1500, timeout=90)
            model_raw = model_resp.strip()
            start = model_raw.find("{")
            end = model_raw.rfind("}")
            if start != -1 and end != -1 and end > start:
                json_text = model_raw[start:end+1]
                try:
                    parsed = json.loads(json_text)
                    items = parsed.get("items", [])
                    raw_passage = parsed.get("raw", "") or ""
                    if isinstance(items, list):
                        parsed_items = items
                        parsed_raw_passage = raw_passage
                        print("✅ SUCCESS: Found REQUIRED PROPONENT TOC from client!")
                        proponent_toc = json.dumps({"items": parsed_items, "raw": parsed_raw_passage}, ensure_ascii=False)
                        print("REQUIRED PROPONENT TOC EXTRACTED:")
                        print("=" * 70)
                        for i, item in enumerate(parsed_items, 1):
                            print(f"{i}. {item}")
                        print("=" * 70)
                        if not parsed_items:
                            print("⚠️  NO REQUIRED PROPONENT TOC FOUND - Client did not specify mandatory proposal structure")
                            return "No required response TOC found - client did not specify mandatory proposal structure for proponents."
                        return proponent_toc
                    else:
                        raise ValueError("Parsed JSON doesn't contain an 'items' list")
                except Exception as pe:
                    print(f"JSON parse error on extract attempt {attempt}: {pe}")
                    if attempt < max_extract_attempts:
                        time.sleep(1.0 * attempt)
                        continue
                    else:
                        fallback = model_raw
                        print("Model returned malformed JSON; returning raw model output as fallback.")
                        return fallback
            else:
                print(f"No JSON object found in model response on attempt {attempt}.")
                if attempt < max_extract_attempts:
                    time.sleep(1.0 * attempt)
                    continue
                else:
                    return "No required response TOC found - client did not specify mandatory proposal structure for proponents."
        except requests.HTTPError as he:
            print(f"HTTP error calling OpenAI on attempt {attempt}: {he}")
            if attempt < max_extract_attempts:
                time.sleep(1.0 * attempt)
                continue
            return f"HTTP error during extract step: {he}"
        except Exception as e:
            print(f"Unexpected error during extract attempt {attempt}: {e}")
            if attempt < max_extract_attempts:
                time.sleep(1.0 * attempt)
                continue
            return f"Error during extract step: {e}"

    return "No required response TOC found - client did not specify mandatory proposal structure for proponents."

def format_toc_for_display(toc_string: str) -> str:
    """
    Convert JSON TOC format to clean, readable list format for frontend display.
    """
    if not toc_string or toc_string == "No required response TOC found - client did not specify mandatory proposal structure for proponents.":
        return toc_string
    
    try:
        toc_data = json.loads(toc_string)
        items = toc_data.get("items", [])
        
        if not items:
            return "No required response TOC found - client did not specify mandatory proposal structure for proponents."
        
        formatted_lines = ["Required Proposal Structure:"]
        for i, item in enumerate(items, 1):
            formatted_lines.append(f"{i}. {item}")
        
        return "\n".join(formatted_lines)
        
    except (json.JSONDecodeError, TypeError):
        return toc_string

def create_structured_response_sections_with_toc(
    document_content: str,
    required_proponent_toc: str
) -> List[Dict[str, Any]]:
    """
    Dynamically create response sections using the required TOC (if provided & valid).
    Handles cases where TOC items are dicts OR plain strings.
    """
    response_sections = []

    try:
        if not required_proponent_toc or required_proponent_toc.startswith("No required response TOC"):
            print("⚠️ No usable TOC provided")
            return []

        try:
            toc_data = json.loads(required_proponent_toc)
            toc_sections = toc_data.get("items", [])
            print(f"✅ Parsed TOC JSON with {len(toc_sections)} sections")
        except (json.JSONDecodeError, TypeError):
            print("❌ TOC is not valid JSON")
            return []

        for order, section in enumerate(toc_sections, start=1):
            # If it's a string → wrap into dict-like structure
            if isinstance(section, str):
                section_name = section
                section_number = str(order)
                original_entry = section
            elif isinstance(section, dict):
                section_name = section.get("title") or section.get("name") or f"Section {order}"
                section_number = section.get("number", str(order))
                original_entry = section
            else:
                print(f"⚠️ Skipping unsupported TOC entry: {section}")
                continue

            sort_key = f"{order:03d}.000.000.000"

            response_sections.append({
                "section_name": section_name,
                "section_purpose": f"Required section from TOC: {section_number} {section_name}",
                "addresses_rfp_themes": [section_name.lower().replace(" ", "_")],
                "company_content_needed": f"Content needed for {section_name} as specified in client's required structure",
                "knowledge_base_queries": [section_name.lower().replace(" ", "_")],
                "section_order": order,
                "sort_key": sort_key,
                "estimated_length": "2-3 pages",
                "criticality": "High",
                "content_focus": "comprehensive",
                "source": "toc_mapping",
                "original_toc_entry": original_entry,
                "section_number": section_number
            })

        print(f"✅ Created {len(response_sections)} response sections from TOC mapping")
        return response_sections

    except Exception as e:
        print(f"❌ Error creating structured response sections with TOC: {e}")
        return []
    

async def generate_sections_with_llm(content: str) -> str:
    """
    If no required TOC is found, generate a logical TOC with Azure OpenAI.
    Returns a JSON string (same format as get_response_structure_requirements).
    """

    prompt = f"""
    You are an expert RFP analyst. The client document does not specify a mandatory 
    proposal Table of Contents for proponents. Based on the content below, 
    generate a logical TOC structure of sections that a proponent should include 
    in their response.

    Rules:
    1. Propose 6–10 top-level sections (Cover Letter, Company Overview, Technical Approach, etc).
    2. Each section can have 1–3 subsections.
    3. Keep names short & professional.
    4. Return JSON only in this format:

    {{
      "items": [
        "Cover Letter",
        "Company Overview",
        "Technical Approach",
        "Project Plan",
        "Pricing & Commercials",
        "Declaration and Signature"
      ],
      "raw": "Generated based on document content"
    }}

    --- Document Content (truncated) ---
    {content[:4000]}
    """

    url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_DEPLOYMENT_NAME}/chat/completions?api-version={AZURE_OPENAI_VERSION}"
    headers = {"api-key": AZURE_OPENAI_KEY, "Content-Type": "application/json"}
    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 1200
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        result = resp.json()
        model_output = result["choices"][0]["message"]["content"].strip()

        # Parse into clean JSON
        start = model_output.find("{")
        end = model_output.rfind("}")
        if start != -1 and end != -1:
            return model_output[start:end+1]

        return json.dumps({
            "items": ["Cover Letter", "Company Overview", "Technical Approach", "Project Plan", "Pricing & Commercials", "Declaration and Signature"],
            "raw": "Generated fallback TOC"
        })

    except Exception as e:
        print(f"LLM TOC generation failed: {e}")
        return json.dumps({
            "items": ["Cover Letter", "Company Overview", "Technical Approach", "Project Plan", "Pricing & Commercials", "Declaration and Signature"],
            "raw": "LLM generation error"
        })

