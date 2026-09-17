import os
import sys

from build_section_1 import get_section_1
from build_section_tally import get_tally_analysis
from build_section_busy import get_busy_analysis
from build_section_zoho import get_zoho_analysis
from build_section_vyapar import get_vyapar_analysis
from build_section_erpnext import get_erpnext_analysis
from build_section_mybillbook import get_mybillbook_analysis
from build_section_marg import get_marg_analysis
from build_matrices import get_matrices
from build_ux_and_synthesis import get_ux_and_synthesis
from build_recommendations_and_architecture import get_recommendations_and_architecture
from build_blueprint_and_schema import get_blueprint_and_schema

def main():
    sections = [
        get_section_1(),
        get_tally_analysis(),
        get_busy_analysis(),
        get_zoho_analysis(),
        get_vyapar_analysis(),
        get_erpnext_analysis(),
        get_mybillbook_analysis(),
        get_marg_analysis(),
        get_matrices(),
        get_ux_and_synthesis(),
        get_recommendations_and_architecture(),
        get_blueprint_and_schema()
    ]
    
    full_content = "\n\n---\n\n".join(sections)
    output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "documentation", "COMPETITIVE_RESEARCH_AND_PRODUCT_BLUEPRINT.md")
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(full_content)
        
    print(f"Report assembled successfully at: {output_path}")
    print(f"Total characters: {len(full_content)}")
    print(f"Total lines: {full_content.count(chr(10)) + 1}")

if __name__ == "__main__":
    main()
