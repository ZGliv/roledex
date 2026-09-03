from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path("/Users/Test/Desktop/Job Search 2026")
HQ = ROOT / "Job Search HQ"
RESUMES = HQ / "01 Resumes"
LETTERS = HQ / "02 Cover Letters"
PNC = HQ / "03 Application Packets" / "PNC - Business Systems Analyst"

FONT = "Arial"
NAVY = RGBColor(21, 43, 70)
BLUE = RGBColor(57, 83, 112)
INK = RGBColor(31, 37, 45)
MUTED = RGBColor(82, 92, 105)
LIGHT = "D8E0E8"


@dataclass(frozen=True)
class ResumeSpec:
    filename: str
    target: str
    summary: str
    altera: tuple[str, ...]
    parlai: tuple[str, ...]
    ushop: str
    jobswipe: str
    skills: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class LetterSpec:
    filename: str
    date: str
    company: str
    role: str
    opening: str
    proof: str
    fit: str
    closing: str


RESUME_SPECS = (
    ResumeSpec(
        filename="Zack_Glivic_Resume_Business_Systems_Implementation.docx",
        target="BUSINESS SYSTEMS  |  IMPLEMENTATION  |  WORKFLOW ANALYSIS",
        summary=(
            "Early-career business systems and implementation professional combining live healthcare IT support "
            "with hands-on ownership of shipped software products. Skilled at clarifying ambiguous user needs, "
            "documenting technical context, testing workflows, and translating operational problems into practical solutions."
        ),
        altera=(
            "Support clinical and administrative users in a 24/7 hospital environment; triage access, endpoint, browser, and application issues while explaining next steps under pressure.",
            "Translate incomplete user reports into structured problem statements, reproduction details, documentation, and clean escalations for specialized teams.",
            "Manage Active Directory access and Windows imaging/deployment while maintaining ownership through resolution or a clear handoff.",
        ),
        parlai=(
            "Built and shipped a live web and iOS AI research product using React, TypeScript, Supabase/Postgres, Vercel, Capacitor, and 60+ edge functions.",
            "Designed structured user workflows, quality controls, public accountability records, release processes, and operational incident response.",
        ),
        ushop="Built a pre-release mobile commerce system spanning shopper and staff workflows, catalog, inventory, permissions, checkout, fulfillment, and pickup/delivery operations.",
        jobswipe="Built a job-discovery product that ingests official ATS feeds, applies transparent fit scoring, and preserves application decisions using Next.js, Drizzle, and Turso.",
        skills=(
            ("Systems", "requirements clarification, workflow analysis, process improvement, QA/UAT concepts, documentation, user enablement"),
            ("Technical", "Active Directory, Windows deployment, React, TypeScript/JavaScript, SQL/Postgres, REST APIs, Supabase, Git"),
        ),
    ),
    ResumeSpec(
        filename="Zack_Glivic_Resume_Solutions_Customer_Success.docx",
        target="SOLUTIONS  |  TECHNICAL CUSTOMER SUCCESS  |  PRODUCT OPERATIONS",
        summary=(
            "Customer-facing technology professional who learns products quickly, isolates ambiguous problems, and "
            "turns technical complexity into clear next steps. Combines healthcare support discipline with hands-on "
            "ownership of live web and iOS products built through AI-assisted development."
        ),
        altera=(
            "Guide clinical and administrative users through technical issues by asking focused questions, isolating the actual failure, and communicating practical next steps.",
            "Troubleshoot account, endpoint, browser, and application workflows in a 24/7 environment; escalate with useful reproduction details instead of raw symptoms.",
            "Balance concurrent requests, document decisions clearly, and maintain ownership until resolution or a clean specialized handoff.",
        ),
        parlai=(
            "Own the product story end to end: user workflow, interface decisions, technical architecture, data-quality controls, web/iOS releases, and daily operations.",
            "Built the product with React/TypeScript, Supabase/Postgres, REST-style integrations, Vercel, Capacitor, and multi-provider AI workflows.",
        ),
        ushop="Translated a real store owner's operational needs into a pre-release mobile commerce system with shopper/staff experiences, inventory, barcode, checkout, and delivery workflows.",
        jobswipe="Designed a personal job-discovery product that converts noisy employer feeds into explainable recommendations and clear keep/pass decisions.",
        skills=(
            ("Customer", "technical discovery, product explanation, troubleshooting, documentation, structured escalation, training concepts"),
            ("Technical", "React, TypeScript/JavaScript, SQL/Postgres, REST APIs, Supabase, Firebase, Vercel, Git/GitHub"),
        ),
    ),
    ResumeSpec(
        filename="Zack_Glivic_Resume_Healthcare_Technology.docx",
        target="HEALTHCARE TECHNOLOGY  |  APPLICATION SUPPORT  |  IMPLEMENTATION",
        summary=(
            "Healthcare IT professional embedded in a live hospital environment, experienced in clarifying clinical-user "
            "problems, documenting technical context, and coordinating resolution under time pressure. Brings additional "
            "product and workflow perspective from shipping software across web and iOS."
        ),
        altera=(
            "Support clinicians and administrative staff across a 24/7 hospital environment, triaging issues that affect account access, endpoints, browsers, and application workflows.",
            "Convert high-pressure requests into accurate tickets, practical workarounds, and actionable escalations so users and specialized teams can keep moving.",
            "Perform Active Directory access work and Windows PC imaging/deployment while communicating clearly with nontechnical users.",
        ),
        parlai=(
            "Shipped and operate a live web and iOS product, owning workflow design, release coordination, quality controls, documentation, and ongoing issue resolution.",
            "Converted a complex research process into structured, inspectable records designed to make product output understandable and accountable.",
        ),
        ushop="Designed shopper and staff workflows for a pre-release mobile commerce system, including inventory, fulfillment, pickup/delivery, access controls, and checkout architecture.",
        jobswipe="Built an explainable job-discovery and decision system using Next.js, Drizzle, Turso, and official employer feeds.",
        skills=(
            ("Healthcare IT", "clinical-user support, incident triage, documentation, user communication, workflow analysis, implementation support"),
            ("Technical", "Active Directory, Windows imaging/deployment, React, TypeScript/JavaScript, SQL/Postgres, Supabase, Git"),
        ),
    ),
)


PNC_RESUME = ResumeSpec(
    filename="Zack_Glivic_PNC_Business_Systems_Analyst_Resume.docx",
    target="BUSINESS SYSTEMS ANALYSIS  |  CHANGE ENABLEMENT  |  APPLICATION DELIVERY",
    summary=(
        "Early-career technology professional who translates unclear user needs into structured documentation, "
        "testable workflows, and practical next steps. Combines live healthcare IT support with hands-on product "
        "ownership across requirements clarification, QA, release readiness, user communication, and process improvement."
    ),
    altera=(
        "Gather facts from clinical and administrative users, analyze the current issue, and translate incomplete reports into clear documentation and actionable next steps.",
        "Support application and endpoint workflows in a 24/7 hospital environment; test likely causes, communicate impacts, and coordinate resolution across users and technical teams.",
        "Manage Active Directory access and Windows deployment processes while creating clean handoffs that protect operational continuity.",
    ),
    parlai=(
        "Took a live web and iOS product from concept through workflow design, implementation, testing, release, user-facing documentation, and ongoing operations.",
        "Built structured quality gates and public accountability records using React/TypeScript, Supabase/Postgres, Vercel, Capacitor, and 60+ edge functions.",
    ),
    ushop="Mapped real retail operations into shopper and staff workflows covering catalog, inventory, access, checkout, fulfillment, and pickup/delivery for a pre-release mobile product.",
    jobswipe="Designed an explainable job-discovery system that normalizes official employer data, scores role fit, and records user decisions using Next.js, Drizzle, and Turso.",
    skills=(
        ("Analysis", "requirements clarification, workflow analysis, process mapping concepts, technical documentation, QA/UAT concepts, change enablement"),
        ("Technical", "Active Directory, Windows deployment, React, TypeScript/JavaScript, SQL/Postgres, REST APIs, Supabase, Git"),
    ),
)


LETTER_SPECS = (
    LetterSpec(
        filename="Zack_Glivic_Cover_Letter_Business_Systems_Implementation.docx",
        date="[Date]",
        company="[Company]",
        role="[Business Systems / Implementation Role]",
        opening=(
            "I am applying for the [Role] position because it sits at the intersection of work I already do well: "
            "understanding user problems, organizing technical context, improving workflows, and helping people adopt useful systems."
        ),
        proof=(
            "At Altera Digital Health, embedded at St. Clair Hospital, I support clinical and administrative users in a "
            "24/7 environment. I gather facts from incomplete reports, investigate access and application issues, document "
            "reproduction details, and coordinate clean escalations. Outside work, I built and shipped Parl.ai across web "
            "and iOS, owning workflow design, testing, release readiness, documentation, and continuing operations."
        ),
        fit=(
            "That combination gives me an unusual early-career foundation: direct experience with nontechnical users and "
            "enterprise support, plus the initiative to turn ambiguous problems into functioning products. I would bring "
            "clear communication, careful documentation, product curiosity, and the willingness to learn [Company]'s systems deeply."
        ),
        closing="I would welcome the opportunity to discuss how I could contribute to the [Team] team as a [Role].",
    ),
    LetterSpec(
        filename="Zack_Glivic_Cover_Letter_Solutions_Customer_Success.docx",
        date="[Date]",
        company="[Company]",
        role="[Solutions / Technical Customer Success Role]",
        opening=(
            "I am excited to apply for the [Role] position. The role matches the work that energizes me most: learning a "
            "product deeply, asking the right questions, explaining technical ideas clearly, and helping users move from confusion to confidence."
        ),
        proof=(
            "In my current role with Altera Digital Health, I guide clinical and administrative users through technical "
            "problems in a live hospital environment. I isolate the real issue, communicate practical next steps, and create "
            "documentation that allows specialized teams to act quickly. I also built and operate Parl.ai, a live web and iOS "
            "product that has required product discovery, technical troubleshooting, release management, and user-focused communication."
        ),
        fit=(
            "I am not presenting myself as a conventional software engineer. My strength is connecting customers, products, "
            "and technical teams: understanding what someone needs, learning enough of the system to be useful, and maintaining "
            "ownership until there is a clear outcome. That is the foundation I would bring to [Company]."
        ),
        closing="I would value the opportunity to discuss how my support discipline and product-building experience could help [Company]'s customers succeed.",
    ),
    LetterSpec(
        filename="Zack_Glivic_Cover_Letter_Healthcare_Technology.docx",
        date="[Date]",
        company="[Company]",
        role="[Healthcare Technology Role]",
        opening=(
            "I am applying for the [Role] position because I want to move closer to the implementation and improvement of "
            "healthcare software while building on the frontline clinical IT perspective I use every day."
        ),
        proof=(
            "At Altera Digital Health, embedded at St. Clair Hospital, I support clinicians and administrative staff in a "
            "24/7 environment. I clarify high-pressure requests, troubleshoot access and application workflows, document "
            "technical context, and coordinate resolution across users and specialized teams. The role has taught me that "
            "healthcare technology succeeds only when users can understand it and trust the process around it."
        ),
        fit=(
            "My product work adds another useful dimension. I have taken software from concept through workflow design, testing, "
            "web and iOS release, documentation, and ongoing operations. I would bring that product ownership, together with "
            "healthcare support discipline and calm communication, to [Company]'s [Team] team."
        ),
        closing="I would welcome a conversation about how I could contribute to a reliable, thoughtful experience for [Company]'s customers and users.",
    ),
    LetterSpec(
        filename="Zack_Glivic_PNC_Business_Systems_Analyst_Cover_Letter.docx",
        date="September 3, 2026",
        company="PNC",
        role="Business Systems Analyst",
        opening=(
            "I am applying for the Business Systems Analyst position because its focus on requirements, workflow analysis, "
            "testing, documentation, and successful technology adoption closely matches the direction of my experience and career."
        ),
        proof=(
            "At Altera Digital Health, embedded at St. Clair Hospital, I support clinical and administrative users in a "
            "24/7 environment. I gather facts from incomplete reports, investigate access and application issues, communicate "
            "operational impacts, and turn raw symptoms into documentation and escalations that technical teams can use. "
            "That work has made me disciplined about asking precise questions and keeping users informed through change."
        ),
        fit=(
            "Outside work, I built and shipped Parl.ai across web and iOS and created JobSwipe to structure my own job-search "
            "workflow. Those projects required me to define user flows, test behavior, document decisions, coordinate releases, "
            "and improve systems after real use. I would bring that initiative, user empathy, and practical product perspective "
            "to PNC while developing deeper formal business-analysis expertise."
        ),
        closing="I would welcome the opportunity to discuss how I could support PNC's teams in turning business needs into clear, testable, and adoptable technology changes.",
    ),
)


def set_cell_margins(cell, top=0, start=0, bottom=0, end=0):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_font(run, size, bold=False, color=INK, italic=False):
    run.font.name = FONT
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), FONT)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), FONT)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color


def add_hyperlink(paragraph, text, url, color=BLUE, underline=False):
    part = paragraph.part
    rel_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    fonts = OxmlElement("w:rFonts")
    fonts.set(qn("w:ascii"), FONT)
    fonts.set(qn("w:hAnsi"), FONT)
    r_pr.append(fonts)
    size = OxmlElement("w:sz")
    size.set(qn("w:val"), "17")
    r_pr.append(size)
    color_el = OxmlElement("w:color")
    color_el.set(qn("w:val"), str(color))
    r_pr.append(color_el)
    if underline:
        u = OxmlElement("w:u")
        u.set(qn("w:val"), "single")
        r_pr.append(u)
    run.append(r_pr)
    text_el = OxmlElement("w:t")
    text_el.text = text
    run.append(text_el)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def add_bottom_border(paragraph, color=LIGHT, size="8", space="2"):
    p_pr = paragraph._p.get_or_add_pPr()
    p_bdr = p_pr.find(qn("w:pBdr"))
    if p_bdr is None:
        p_bdr = OxmlElement("w:pBdr")
        p_pr.append(p_bdr)
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), size)
    bottom.set(qn("w:space"), space)
    bottom.set(qn("w:color"), color)
    p_bdr.append(bottom)


def keep_with_next(paragraph):
    paragraph.paragraph_format.keep_with_next = True


def configure_document(doc: Document, resume=True):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.50 if resume else 0.64)
    section.bottom_margin = Inches(0.50 if resume else 0.64)
    section.left_margin = Inches(0.62 if resume else 0.72)
    section.right_margin = Inches(0.62 if resume else 0.72)
    section.header_distance = Inches(0.30)
    section.footer_distance = Inches(0.30)

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    normal.font.size = Pt(9.35 if resume else 10.5)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.02 if resume else 1.08

    if "Resume Bullet" not in doc.styles:
        style = doc.styles.add_style("Resume Bullet", WD_STYLE_TYPE.PARAGRAPH)
    else:
        style = doc.styles["Resume Bullet"]
    style.base_style = normal
    style.font.name = FONT
    style._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    style._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    style.font.size = Pt(9.2)
    style.paragraph_format.left_indent = Inches(0.19)
    style.paragraph_format.first_line_indent = Inches(-0.13)
    style.paragraph_format.space_after = Pt(1.1)
    style.paragraph_format.line_spacing = 1.0

    doc.core_properties.author = "Zack Glivic"
    doc.core_properties.last_modified_by = "Zack Glivic"
    doc.core_properties.keywords = "resume, career, job application"


def add_resume_header(doc: Document, target: str):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    keep_with_next(p)
    set_font(p.add_run("ZACK GLIVIC"), 22.5, bold=True, color=NAVY)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    keep_with_next(p)
    set_font(p.add_run(target), 9.2, bold=True, color=BLUE)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    set_font(p.add_run("Pittsburgh, PA  |  (440) 283-5412  |  "), 8.5, color=MUTED)
    add_hyperlink(p, "zgliv21@gmail.com", "mailto:zgliv21@gmail.com")
    set_font(p.add_run("  |  "), 8.5, color=MUTED)
    add_hyperlink(p, "linkedin.com/in/zackary-glivic", "https://www.linkedin.com/in/zackary-glivic/")
    set_font(p.add_run("  |  "), 8.5, color=MUTED)
    add_hyperlink(p, "betparl.ai", "https://betparl.ai")
    add_bottom_border(p, color="9AAABD", size="10", space="5")


def add_section(doc: Document, text: str):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4.6)
    p.paragraph_format.space_after = Pt(2.3)
    keep_with_next(p)
    set_font(p.add_run(text.upper()), 9.2, bold=True, color=NAVY)
    add_bottom_border(p, color=LIGHT, size="6", space="2")


def add_role(doc: Document, heading: str, date: str, subline: str | None = None):
    table = doc.add_table(rows=1, cols=2)
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.columns[0].width = Inches(5.85)
    table.columns[1].width = Inches(1.40)
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), "10440")
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.find(qn("w:tblInd"))
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "0")
    tbl_ind.set(qn("w:type"), "dxa")
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        borders.append(el)
    tbl_pr.append(borders)
    for i, width in enumerate((8424, 2016)):
        cell = table.rows[0].cells[i]
        cell.width = Inches(width / 1440)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_margins(cell, top=0, start=0, bottom=0, end=0)
        tc_w = cell._tc.get_or_add_tcPr().find(qn("w:tcW"))
        if tc_w is None:
            tc_w = OxmlElement("w:tcW")
            cell._tc.get_or_add_tcPr().append(tc_w)
        tc_w.set(qn("w:w"), str(width))
        tc_w.set(qn("w:type"), "dxa")
    p = table.rows[0].cells[0].paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    keep_with_next(p)
    set_font(p.add_run(heading), 9.6, bold=True, color=INK)
    p = table.rows[0].cells[1].paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_after = Pt(0)
    keep_with_next(p)
    set_font(p.add_run(date), 9.0, bold=True, color=MUTED)
    if subline:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(1.1)
        keep_with_next(p)
        set_font(p.add_run(subline), 8.8, color=MUTED)


def add_bullet(doc: Document, text: str):
    p = doc.add_paragraph(style="Resume Bullet")
    set_font(p.add_run("•\t"), 9.2, color=INK)
    set_font(p.add_run(text), 9.2, color=INK)


def add_inline_entry(doc: Document, label: str, text: str):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(1.0)
    set_font(p.add_run(label + ": "), 9.15, bold=True, color=INK)
    set_font(p.add_run(text), 9.15, color=INK)


def build_resume(spec: ResumeSpec, out_path: Path):
    doc = Document()
    configure_document(doc, resume=True)
    doc.core_properties.title = f"Zack Glivic - {spec.target.title()} Resume"
    doc.core_properties.subject = spec.target.title()
    add_resume_header(doc, spec.target)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.line_spacing = 1.02
    set_font(p.add_run(spec.summary), 9.45, color=INK)

    add_section(doc, "Experience")
    add_role(doc, "Altera Digital Health - Associate Service Desk Analyst", "Jan 2026-Present", "St. Clair Hospital | Pittsburgh, PA")
    for bullet in spec.altera:
        add_bullet(doc, bullet)

    add_section(doc, "Selected Product Work")
    add_role(doc, "Parl.ai - Founder & Product Builder", "Oct 2025-Present", "betparl.ai | Live web and iOS product")
    for bullet in spec.parlai:
        add_bullet(doc, bullet)
    add_role(doc, "UShop - Product Builder", "2025", "Pre-release mobile commerce system")
    add_bullet(doc, spec.ushop)
    add_role(doc, "JobSwipe - Product Builder", "2026", "Personal job-discovery and decision system")
    add_bullet(doc, spec.jobswipe)

    add_section(doc, "Leadership & Consulting")
    add_inline_entry(doc, "Miami Business Consulting - Project Manager | 2021-2024", "Contributed to digital-platform strategy for WaiWear and healthcare-market research for Medicare startup Circulo.")
    add_inline_entry(doc, "KeyBank FYIC Client Challenge - Team Lead | Spring 2021", "Led research and an executive presentation proposing an AI-powered customer-service concept; top-20 team.")

    add_section(doc, "Education")
    add_role(doc, "Miami University, Farmer School of Business", "May 2025", "B.S. Emerging Technology in Business & Design | Minor: General Business")

    add_section(doc, "Skills")
    for label, value in spec.skills:
        add_inline_entry(doc, label, value)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)


def add_letter_header(doc: Document, role: str):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    set_font(p.add_run("ZACK GLIVIC"), 21, bold=True, color=NAVY)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    set_font(p.add_run("Pittsburgh, PA  |  (440) 283-5412  |  "), 8.8, color=MUTED)
    add_hyperlink(p, "zgliv21@gmail.com", "mailto:zgliv21@gmail.com")
    set_font(p.add_run("  |  "), 8.8, color=MUTED)
    add_hyperlink(p, "linkedin.com/in/zackary-glivic", "https://www.linkedin.com/in/zackary-glivic/")
    set_font(p.add_run("  |  "), 8.8, color=MUTED)
    add_hyperlink(p, "betparl.ai", "https://betparl.ai")
    add_bottom_border(p, color="9AAABD", size="10", space="5")

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(1)
    set_font(p.add_run(role), 11.2, bold=True, color=NAVY)


def add_letter_paragraph(doc: Document, text: str, after=9):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.12
    set_font(p.add_run(text), 10.5, color=INK)


def build_letter(spec: LetterSpec, out_path: Path):
    doc = Document()
    configure_document(doc, resume=False)
    doc.core_properties.title = f"Zack Glivic - {spec.role} Cover Letter"
    doc.core_properties.subject = f"Application for {spec.role} at {spec.company}"
    add_letter_header(doc, spec.role)
    add_letter_paragraph(doc, spec.date, after=8)
    add_letter_paragraph(doc, spec.company, after=14)
    add_letter_paragraph(doc, "Dear Hiring Team,", after=10)
    add_letter_paragraph(doc, spec.opening)
    add_letter_paragraph(doc, spec.proof)
    add_letter_paragraph(doc, spec.fit)
    add_letter_paragraph(doc, spec.closing, after=15)
    add_letter_paragraph(doc, "Sincerely,", after=3)
    p = doc.add_paragraph()
    set_font(p.add_run("Zack Glivic"), 10.5, bold=True, color=NAVY)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)


def main():
    RESUMES.mkdir(parents=True, exist_ok=True)
    LETTERS.mkdir(parents=True, exist_ok=True)
    PNC.mkdir(parents=True, exist_ok=True)

    for spec in RESUME_SPECS:
        build_resume(spec, RESUMES / spec.filename)
    build_resume(PNC_RESUME, PNC / PNC_RESUME.filename)

    for spec in LETTER_SPECS[:3]:
        build_letter(spec, LETTERS / spec.filename)
    build_letter(LETTER_SPECS[3], PNC / LETTER_SPECS[3].filename)


if __name__ == "__main__":
    main()
