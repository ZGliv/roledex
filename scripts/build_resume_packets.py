from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path("/Users/Test/Desktop/Job Search 2026")
OUTPUT = ROOT / "output" / "resumes"

NAVY = RGBColor(25, 48, 79)
INK = RGBColor(30, 38, 48)
MUTED = RGBColor(75, 85, 99)


@dataclass(frozen=True)
class ResumeSpec:
    slug: str
    filename: str
    target: str
    summary: str
    altera_bullets: tuple[str, ...]
    parlai_bullets: tuple[str, ...]
    ushop_bullet: str
    skills: tuple[str, ...]


SPECS = (
    ResumeSpec(
        slug="foundant-aic",
        filename="Zack_Glivic_Foundant_Associate_Implementation_Consultant_Resume",
        target="CLIENT IMPLEMENTATION | TECHNICAL SUPPORT | AI-NATIVE PRODUCT WORK",
        summary=(
            "Client-focused technology professional with healthcare IT support experience and hands-on ownership of "
            "AI-assisted software products. Strong at learning unfamiliar systems, guiding nontechnical users through "
            "technical steps, documenting issues accurately, and translating business workflows into usable software."
        ),
        altera_bullets=(
            "Support clinical and administrative users in a 24/7 hospital environment by gathering facts, troubleshooting access, browser, application-launcher, password, and endpoint issues, and escalating with clear documentation.",
            "Manage Active Directory access and deploy Windows PCs through enterprise processes; translate technical steps into plain language for stressed, nontechnical users.",
            "Apply service-desk discipline to triage urgency, record reproduction details, communicate blockers, and maintain ownership through resolution or a clean escalation.",
        ),
        parlai_bullets=(
            "Owned product direction from workflow and interface design through web and App Store release, data-quality controls, operational debugging, and ongoing improvement.",
            "Turned a complex research process into structured user flows and public, source-grounded records designed to make product output inspectable and accountable.",
        ),
        ushop_bullet="Translated real operational constraints into catalog, staff, fulfillment, pickup/delivery, role-protection, and server-priced checkout workflows across shopper and staff applications.",
        skills=(
            "Client support, issue triage, documentation, workflow analysis, QA/testing, software-configuration concepts",
            "Active Directory, Windows deployment, SQL/Postgres exposure, TypeScript/JavaScript, React, Supabase, Vercel, Git",
        ),
    ),
    ResumeSpec(
        slug="hightouch-cse",
        filename="Zack_Glivic_Hightouch_Customer_Success_Engineer_Resume",
        target="CUSTOMER SUCCESS ENGINEERING | TECHNICAL SUPPORT | PRODUCT OPERATIONS",
        summary=(
            "Product-adjacent technical support professional who investigates ambiguous problems, explains technical "
            "concepts to nontechnical users, and documents enough context for the next resolver to act. Daily AI-tool user "
            "and product builder seeking to grow into technical customer success."
        ),
        altera_bullets=(
            "Investigate account, device, browser, and application problems in a 24/7 clinical environment using Windows and Active Directory workflows; document reproduction steps for the next resolver.",
            "Clarify incomplete user reports, identify what is actually broken, and escalate with structured technical context instead of passing along a raw symptom.",
            "Explain technical issues and next steps by phone, written notes, and live walkthroughs while maintaining ownership through resolution or a clean handoff.",
        ),
        parlai_bullets=(
            "Built and operate a production AI sports-research product using React/TypeScript, Supabase/Postgres, authentication, edge functions, Vercel, and Capacitor for iOS.",
            "Run multi-provider AI workflows and troubleshoot rate limits, structured-output failures, data-quality issues, and production incidents with inspectable quality gates.",
        ),
        ushop_bullet="Built a React Native/Expo and Firebase commerce prototype with catalog, inventory, cart, checkout architecture, barcode scanning, and delivery-zone workflows.",
        skills=(
            "Technical support, discovery, structured escalation, customer communication, product operations, REST API familiarity",
            "TypeScript/JavaScript, React, Node.js, SQL/Postgres exposure, Python exposure, Supabase, Firebase, Git/GitHub",
        ),
    ),
    ResumeSpec(
        slug="perfectserve-ic1",
        filename="Zack_Glivic_PerfectServe_Implementation_Consultant_Resume",
        target="HEALTHCARE IMPLEMENTATION | CLINICAL IT SUPPORT | WORKFLOW ENABLEMENT",
        summary=(
            "Healthcare IT support professional embedded in a live hospital environment, experienced in clarifying "
            "clinical-user problems, documenting technical context, and explaining next steps under time pressure. "
            "Seeking to bring that operational perspective into health-system implementation and user enablement."
        ),
        altera_bullets=(
            "Support clinicians and administrative staff in a 24/7 hospital environment; clarify reported issues, document technical context, and coordinate resolutions across users and specialized teams.",
            "Translate high-pressure requests into structured tickets and practical next steps so nontechnical users can continue working while issues are resolved or escalated.",
            "Use Windows and Active Directory workflows to investigate account, device, and application problems; communicate workarounds clearly and maintain accurate handoffs.",
        ),
        parlai_bullets=(
            "Owned product direction, workflow design, web release, App Store release, data-quality controls, and ongoing operational debugging for an AI-assisted software product.",
            "Designed structured user flows that convert a complex research process into understandable, inspectable records for end users.",
        ),
        ushop_bullet="Designed shopper and staff workflows for a pre-release mobile commerce system, including inventory, fulfillment, pickup/delivery, access controls, and checkout architecture.",
        skills=(
            "Healthcare IT support, clinical-user communication, incident documentation, workflow analysis, QA/testing concepts",
            "Active Directory, Windows imaging/deployment, TypeScript/JavaScript, React, SQL/Postgres exposure, Supabase, Firebase, Git",
        ),
    ),
    ResumeSpec(
        slug="samsara-ase",
        filename="Zack_Glivic_Samsara_Associate_Sales_Engineer_Resume",
        target="ASSOCIATE SOLUTIONS ENGINEERING | TECHNICAL DISCOVERY | PRODUCT DEMONSTRATION",
        summary=(
            "Technical builder with a customer-facing edge. Shipped and operates a production AI product while spending "
            "each workday translating technical problems for nontechnical healthcare users. Seeking to apply that blend "
            "to discovery, demonstrations, troubleshooting, and technical trust-building."
        ),
        altera_bullets=(
            "Explain technical issues, workarounds, and next steps to nontechnical clinical users under time pressure while asking focused questions to isolate the real problem.",
            "Troubleshoot Windows endpoints, user access, browsers, and application-launcher issues; escalate with clean reproduction steps when specialized support is required.",
            "Manage Active Directory access and image/deploy Windows PCs through enterprise processes in a live hospital environment.",
        ),
        parlai_bullets=(
            "Designed, built, and shipped an AI sports-research platform with React/TypeScript, Supabase/Postgres, edge functions, Vercel, and an iOS build via Capacitor.",
            "Own the product story end to end: user workflow, technical architecture, data-quality controls, incident response, and clear explanations of how the system works.",
        ),
        ushop_bullet="Built a mobile commerce prototype with shopper/staff workflows, Stripe checkout architecture, barcode scanning, inventory tools, and delivery validation.",
        skills=(
            "Technical discovery, product explanation, troubleshooting, structured escalation, customer communication",
            "TypeScript/JavaScript, React, React Native, Node.js, SQL/Postgres exposure, REST APIs, Supabase, Firebase, Git/GitHub",
        ),
    ),
    ResumeSpec(
        slug="foundant-ic",
        filename="Zack_Glivic_Foundant_Implementation_Consultant_Resume",
        target="SOFTWARE IMPLEMENTATION | CONFIGURATION | QA & CLIENT SUPPORT",
        summary=(
            "Customer-facing technology professional with healthcare support discipline and hands-on software-product "
            "ownership. Experienced in investigating issues, documenting requirements and reproduction details, testing "
            "workflows, and translating technical constraints into clear user-facing next steps."
        ),
        altera_bullets=(
            "Investigate clinical-user issues and document the technical context so specialized teams inherit a usable picture rather than a raw complaint.",
            "Troubleshoot access, device, browser, and application-launcher problems using Windows and Active Directory workflows; maintain clear ownership and escalation notes.",
            "Explain workarounds and next steps to nontechnical users in a 24/7 hospital environment where accurate handoffs directly affect operational continuity.",
        ),
        parlai_bullets=(
            "Built and operate a production React/TypeScript product with Supabase/Postgres, authentication, row-level security, edge functions, Vercel, and an iOS release via Capacitor.",
            "Designed workflows, tested data-quality gates, investigated production failures, and hardened access after a credential-security incident.",
        ),
        ushop_bullet="Designed and built pre-release shopper/staff workflows for catalog, inventory, fulfillment, access controls, and server-priced checkout using React Native/Expo and Firebase.",
        skills=(
            "Issue investigation, requirements documentation, workflow analysis, QA/testing, software-configuration concepts, client communication",
            "TypeScript/JavaScript, React, Node.js, SQL/Postgres exposure, Supabase, Firebase, Vercel, Git/GitHub",
        ),
    ),
    ResumeSpec(
        slug="pattern-dsa",
        filename="Zack_Glivic_Pattern_Data_Solutions_Analyst_Resume",
        target="DATA SOLUTIONS | CLIENT SUPPORT | WORKFLOW AUTOMATION",
        summary=(
            "Early-career analyst and product builder who turns operational problems into structured processes. Experienced "
            "in documenting technical context, keeping concurrent investigations organized, and translating user questions "
            "into clear next steps; developing deeper SQL and Python capability."
        ),
        altera_bullets=(
            "Document technical context around clinical-user problems so specialized teams and the next resolver inherit an actionable record, not a raw complaint.",
            "Manage concurrent tickets in a live hospital operation, making the owner, current state, reproduction details, and next step explicit.",
            "Translate nontechnical user reports into structured problem statements while troubleshooting Windows, account-access, device, browser, and application issues.",
        ),
        parlai_bullets=(
            "Designed an accountable research workflow and public-results system, using structured data, deterministic quality gates, and source-grounded records.",
            "Built and operate the product with React/TypeScript, Supabase/Postgres, edge functions, Vercel, and AI-assisted development workflows.",
        ),
        ushop_bullet="Modeled catalog, inventory, staff, fulfillment, delivery, and checkout workflows for a pre-release mobile commerce system.",
        skills=(
            "Data-quality thinking, workflow documentation, client communication, issue investigation, structured handoffs",
            "SQL/Postgres exposure, Python exposure, TypeScript/JavaScript, React, Supabase, Firebase, Git/GitHub, Figma",
        ),
    ),
    ResumeSpec(
        slug="eleos-implementation",
        filename="Zack_Glivic_Eleos_Implementation_Specialist_Resume",
        target="HEALTHCARE IMPLEMENTATION SUPPORT | QA | CUSTOMER ENABLEMENT",
        summary=(
            "Early-career healthcare IT support professional experienced in documenting technical context, explaining "
            "issues to nontechnical users, and keeping specialized teams unblocked. Interested in implementation support, "
            "configuration, QA, and customer enablement for healthcare software."
        ),
        altera_bullets=(
            "Support clinicians and staff in a live hospital environment by clarifying reported issues, documenting technical context, and coordinating resolutions across users and specialized teams.",
            "Translate high-pressure requests into structured tickets and next steps so users can keep working while issues are escalated or resolved.",
            "Use Windows and Active Directory workflows to investigate account, device, and application issues and maintain accurate follow-up documentation.",
        ),
        parlai_bullets=(
            "Owned workflow design, web and App Store releases, data-quality controls, operational debugging, and continuing improvement for an AI-assisted product.",
            "Converted a complex research process into structured, inspectable user flows and public records.",
        ),
        ushop_bullet="Designed shopper and staff workflows for inventory, catalog, fulfillment, access controls, pickup/delivery, and checkout in a pre-release commerce system.",
        skills=(
            "Healthcare IT support, ticket documentation, user communication, workflow analysis, QA/testing concepts, implementation support",
            "Active Directory, Windows imaging/deployment, TypeScript/JavaScript, React, SQL/Postgres exposure, Supabase, Firebase, Git",
        ),
    ),
    ResumeSpec(
        slug="ltk-integrations",
        filename="Zack_Glivic_LTK_Integrations_Specialist_Resume",
        target="INTEGRATIONS SUPPORT | CUSTOMER ONBOARDING | TECHNICAL OPERATIONS",
        summary=(
            "Customer-facing technical support professional who troubleshoots ambiguous issues, documents workflows, and "
            "explains practical next steps to nontechnical users. Product-building experience adds a strong understanding "
            "of integrations, operational constraints, and how software decisions affect customers."
        ),
        altera_bullets=(
            "Support clinicians and staff in a live hospital environment by clarifying reported issues, documenting technical context, and coordinating resolutions across users and specialized teams.",
            "Translate high-pressure requests into structured tickets and next steps, then maintain ownership through resolution or a clean handoff.",
            "Troubleshoot Windows, Active Directory, browser, endpoint, and application-launcher issues while explaining workarounds in plain language.",
        ),
        parlai_bullets=(
            "Built and operate a live web and iOS product using React/TypeScript, Supabase/Postgres, authentication, edge functions, Vercel, and AI-assisted development.",
            "Own product workflows, quality controls, operational debugging, and user-facing explanations across the product lifecycle.",
        ),
        ushop_bullet="Built a pre-release React Native/Expo and Firebase commerce system with shopper/staff surfaces, catalog, inventory, checkout architecture, and delivery workflows.",
        skills=(
            "Technical support, customer communication, onboarding concepts, workflow documentation, structured escalation, product operations",
            "TypeScript/JavaScript, React, React Native, Node.js, REST API familiarity, Supabase, Firebase, Git/GitHub",
        ),
    ),
)


def set_cell_margins(cell, top=0, start=0, bottom=0, end=0):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = tcPr.first_child_found_in("w:tcMar")
    if tcMar is None:
        tcMar = OxmlElement("w:tcMar")
        tcPr.append(tcMar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tcMar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tcMar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_run_font(run, name="Arial", size=Pt(9), bold=False, color=INK):
    run.font.name = name
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), name)
    run.font.size = size
    run.font.bold = bold
    run.font.color.rgb = color


def add_bottom_border(paragraph, color="19304F", size="10", space="2"):
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), size)
    bottom.set(qn("w:space"), space)
    bottom.set(qn("w:color"), color)
    pBdr.append(bottom)
    pPr.append(pBdr)


def configure_document(document: Document):
    section = document.sections[0]
    section.top_margin = Inches(0.48)
    section.bottom_margin = Inches(0.46)
    section.left_margin = Inches(0.58)
    section.right_margin = Inches(0.58)

    normal = document.styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    normal.font.size = Pt(8.7)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.0

    bullet = document.styles["List Bullet"]
    bullet.font.name = "Arial"
    bullet._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    bullet._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    bullet.font.size = Pt(8.55)
    bullet.paragraph_format.left_indent = Inches(0.18)
    bullet.paragraph_format.first_line_indent = Inches(-0.11)
    bullet.paragraph_format.space_after = Pt(0.8)
    bullet.paragraph_format.line_spacing = 0.98


def add_header(document: Document, spec: ResumeSpec):
    name = document.add_paragraph()
    name.alignment = WD_ALIGN_PARAGRAPH.CENTER
    name.paragraph_format.space_after = Pt(0.5)
    run = name.add_run("ZACK GLIVIC")
    set_run_font(run, size=Pt(20), bold=True, color=NAVY)
    run.font.letter_spacing = Pt(0.6)

    target = document.add_paragraph()
    target.alignment = WD_ALIGN_PARAGRAPH.CENTER
    target.paragraph_format.space_after = Pt(1.5)
    run = target.add_run(spec.target)
    set_run_font(run, size=Pt(8.2), bold=True, color=NAVY)

    contact = document.add_paragraph()
    contact.alignment = WD_ALIGN_PARAGRAPH.CENTER
    contact.paragraph_format.space_after = Pt(4)
    run = contact.add_run(
        "Pittsburgh, PA  |  (440) 283-5412  |  zgliv21@gmail.com  |  "
        "linkedin.com/in/zackary-glivic  |  betparl.ai"
    )
    set_run_font(run, size=Pt(8.1), color=MUTED)
    add_bottom_border(contact)

    summary = document.add_paragraph()
    summary.paragraph_format.space_after = Pt(3)
    summary.paragraph_format.line_spacing = 1.03
    run = summary.add_run(spec.summary)
    set_run_font(run, size=Pt(8.8), color=INK)


def add_section_heading(document: Document, label: str):
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(2.6)
    paragraph.paragraph_format.space_after = Pt(1.1)
    run = paragraph.add_run(label.upper())
    set_run_font(run, size=Pt(8.2), bold=True, color=NAVY)
    run.font.letter_spacing = Pt(0.45)
    add_bottom_border(paragraph, color="A8B6C8", size="4", space="1")


def add_entry_heading(document: Document, left: str, right: str, subtitle: str | None = None):
    table = document.add_table(rows=1, cols=2)
    table.autofit = False
    table.columns[0].width = Inches(5.85)
    table.columns[1].width = Inches(1.35)
    table.rows[0].cells[0].width = Inches(5.85)
    table.rows[0].cells[1].width = Inches(1.35)
    for cell in table.rows[0].cells:
        set_cell_margins(cell)
    left_p = table.rows[0].cells[0].paragraphs[0]
    left_p.paragraph_format.space_after = Pt(0)
    left_run = left_p.add_run(left)
    set_run_font(left_run, size=Pt(8.9), bold=True, color=INK)
    right_p = table.rows[0].cells[1].paragraphs[0]
    right_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    right_p.paragraph_format.space_after = Pt(0)
    right_run = right_p.add_run(right)
    set_run_font(right_run, size=Pt(8.2), bold=True, color=MUTED)
    if subtitle:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(0.7)
        run = paragraph.add_run(subtitle)
        set_run_font(run, size=Pt(8), color=MUTED)


def add_bullets(document: Document, bullets: Iterable[str]):
    for text in bullets:
        paragraph = document.add_paragraph(style="List Bullet")
        run = paragraph.add_run(text)
        set_run_font(run, size=Pt(8.55), color=INK)


def add_compact_line(document: Document, label: str, text: str):
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(0.7)
    paragraph.paragraph_format.line_spacing = 0.98
    label_run = paragraph.add_run(label)
    set_run_font(label_run, size=Pt(8.45), bold=True, color=INK)
    text_run = paragraph.add_run(text)
    set_run_font(text_run, size=Pt(8.35), color=INK)


def build_resume(spec: ResumeSpec):
    destination = OUTPUT / spec.slug
    destination.mkdir(parents=True, exist_ok=True)
    document = Document()
    configure_document(document)
    add_header(document, spec)

    add_section_heading(document, "Professional Experience")
    add_entry_heading(
        document,
        "Altera Digital Health - Associate Service Desk Analyst",
        "Jan 2026-Present",
        "Embedded at St. Clair Hospital | Pittsburgh, PA",
    )
    add_bullets(document, spec.altera_bullets)
    add_entry_heading(
        document,
        "Valleybrook Country Club - Server (Seasonal)",
        "Aug 2025-Present",
        "Pittsburgh area",
    )
    add_bullets(document, (
        "Deliver attentive member-facing service while coordinating competing requests and communicating clearly in a time-sensitive environment.",
    ))

    add_section_heading(document, "Selected Product Work")
    add_entry_heading(
        document,
        "Parl.ai - Founder / Product Builder (AI-assisted development)",
        "Oct 2025-Present",
        "betparl.ai | Web and iOS",
    )
    add_bullets(document, spec.parlai_bullets)
    add_entry_heading(
        document,
        "UShop - Product Builder (AI-assisted development)",
        "2025-2026",
        "Pre-release mobile commerce system",
    )
    add_bullets(document, (spec.ushop_bullet,))

    add_section_heading(document, "Leadership")
    add_compact_line(
        document,
        "KeyBank FYIC Client Challenge - Team Lead (Top 20) | Spring 2021: ",
        "Led research and an executive presentation proposing AI-driven customer-service automation.",
    )
    add_compact_line(
        document,
        "Miami Business Consulting - Project Manager | 2021-2024: ",
        "Client work included digital-platform strategy for WaiWear and healthcare-landscape advisory for Medicare startup Circulo.",
    )

    add_section_heading(document, "Education")
    add_entry_heading(
        document,
        "Miami University, Farmer School of Business | Oxford, OH",
        "May 2025",
    )
    add_compact_line(
        document,
        "B.S. Emerging Technology in Business & Design | ",
        "Minor: General Business",
    )

    add_section_heading(document, "Skills")
    add_compact_line(document, "Core: ", spec.skills[0])
    add_compact_line(document, "Technical: ", spec.skills[1])

    footer = document.sections[0].footer
    footer_p = footer.paragraphs[0]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer_p.paragraph_format.space_before = Pt(0)
    footer_run = footer_p.add_run("Zack Glivic")
    set_run_font(footer_run, size=Pt(7), color=MUTED)

    output_path = destination / f"{spec.filename}.docx"
    document.save(output_path)
    return output_path


def main():
    outputs = [build_resume(spec) for spec in SPECS]
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
