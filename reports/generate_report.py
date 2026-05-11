from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Flowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports" / "HCV_Dashboard_5_Page_Report.pdf"

PAGE_W, PAGE_H = letter
MARGIN_X = 0.62 * inch
MARGIN_TOP = 0.58 * inch
MARGIN_BOTTOM = 0.50 * inch
CONTENT_W = PAGE_W - 2 * MARGIN_X

NAVY = colors.HexColor("#172452")
INK = colors.HexColor("#111827")
TEXT = colors.HexColor("#374151")
MUTED = colors.HexColor("#687385")
LINE = colors.HexColor("#D8DEE8")
LIGHT_BLUE = colors.HexColor("#DCEAF4")
MID_BLUE = colors.HexColor("#8DB9D5")
DEEP_BLUE = colors.HexColor("#2E5E8C")
TEAL = colors.HexColor("#2AAEAA")
PAPER = colors.HexColor("#F7FAFC")


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="Kicker",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        tracking=1.5,
        textColor=MUTED,
        uppercase=True,
    )
)
styles.add(
    ParagraphStyle(
        name="ReportTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=NAVY,
        alignment=TA_LEFT,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="PageTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=NAVY,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="Subhead",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=14,
        textColor=NAVY,
        spaceBefore=6,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.6,
        leading=13.2,
        textColor=TEXT,
        spaceAfter=7,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.2,
        leading=11.2,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="Label",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=NAVY,
        spaceAfter=2,
    )
)
styles.add(
    ParagraphStyle(
        name="CenterLabel",
        parent=styles["Label"],
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="Placeholder",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor("#4B5563"),
        spaceAfter=5,
    )
)


class Rule(Flowable):
    def __init__(self, width=CONTENT_W, color=LINE, thickness=0.7, space_before=4, space_after=10):
        super().__init__()
        self.width = width
        self.color = color
        self.thickness = thickness
        self.space_before = space_before
        self.space_after = space_after
        self.height = space_before + thickness + space_after

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        y = self.space_after
        self.canv.line(0, y, self.width, y)


class Bars(Flowable):
    def __init__(self):
        super().__init__()
        self.width = CONTENT_W
        self.height = 92

    def draw(self):
        c = self.canv
        x0 = 10
        y0 = 14
        chart_w = self.width - 20
        label_w = 90
        bar_w = chart_w - label_w - 12
        rows = [
            ("HCV-weighted COI", 36.3, DEEP_BLUE),
            ("Renter-weighted COI", 48.3, MID_BLUE),
        ]
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(NAVY)
        c.drawString(x0, self.height - 12, "National opportunity exposure, 0-100 COI scale")
        for i, (label, value, color) in enumerate(rows):
            y = y0 + (1 - i) * 30
            c.setFillColor(TEXT)
            c.setFont("Helvetica", 8.2)
            c.drawRightString(x0 + label_w, y + 7, label)
            c.setFillColor(colors.HexColor("#E8EEF5"))
            c.rect(x0 + label_w + 12, y, bar_w, 14, stroke=0, fill=1)
            c.setFillColor(color)
            c.rect(x0 + label_w + 12, y, bar_w * value / 100, 14, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 8.4)
            c.drawString(x0 + label_w + 18 + bar_w * value / 100, y + 3, f"{value:.1f}")
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        for tick in [0, 25, 50, 75, 100]:
            x = x0 + label_w + 12 + bar_w * tick / 100
            c.line(x, y0 - 3, x, y0 + 58)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7)
            c.drawCentredString(x, y0 - 13, str(tick))


def img(path, width, height=None):
    im = Image(str(ROOT / path))
    ratio = im.imageHeight / im.imageWidth
    im.drawWidth = width
    im.drawHeight = height if height else width * ratio
    return im


def p(text, style="Body"):
    return Paragraph(text, styles[style])


def bullet_table(items, col_widths=None):
    data = []
    for label, body in items:
        data.append([p(label, "Label"), p(body, "Small")])
    table = Table(data, colWidths=col_widths or [1.55 * inch, CONTENT_W - 1.55 * inch])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.45, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def module_placeholder(title, purpose, to_fill):
    rows = [
        ("Purpose", purpose),
        ("Suggested content", to_fill),
        (
            "Where it fits",
            "This page should connect back to the shared report question: when does formal voucher assistance become real household access?",
        ),
    ]
    return [
        p(title, "PageTitle"),
        Rule(),
        p(
            "This page is reserved for the module owner. The structure below keeps the final report consistent while leaving room for the specific data, methods, and interpretation to be added.",
            "Body",
        ),
        bullet_table(rows),
        Spacer(1, 8),
        p("Recommended final page structure", "Subhead"),
        p(
            "1. Define the indicator and geographic unit. 2. Explain the data source and calculation. 3. Show the most important map or pattern. 4. Interpret what the pattern reveals and what it cannot prove.",
            "Body",
        ),
    ]


def header_footer(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, PAGE_H - 0.38 * inch, PAGE_W - MARGIN_X, PAGE_H - 0.38 * inch)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN_X, 0.30 * inch, "Universal Housing Voucher Program Performance and Supply Demand Gaps")
    canvas.drawRightString(PAGE_W - MARGIN_X, 0.30 * inch, f"{page} / 5")
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        rightMargin=MARGIN_X,
        leftMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
    )
    story = []

    story += [
        p("HCV DASHBOARD REPORT", "Kicker"),
        p("Introduction and Overall Website Layout", "ReportTitle"),
        Rule(),
        p(
            "The project examines whether the Housing Choice Voucher program delivers real housing choice rather than only formal subsidy availability. The website is organized around a user pathway: first, whether assistance reaches households who need it; second, whether local agencies and markets convert assistance into leases; and third, whether successful lease-up expands access to neighborhood opportunity.",
            "Body",
        ),
        p(
            "The landing page frames the project as a national, multi-scale data platform for researchers. It combines administrative HCV indicators with neighborhood context across national, state, county, tract, ZIP code, and PHA geographies where available. The interface then moves into focused modules that turn the shared data infrastructure into specific research questions.",
            "Body",
        ),
        img("images/landing.png", CONTENT_W, 2.25 * inch),
        Spacer(1, 8),
        bullet_table(
            [
                ("Data platform", "A broad interactive map for exploring HCV households, subsidized housing patterns, renter demographics, poverty, rent burden, local housing conditions, and neighborhood context."),
                ("Voucher Gap Ratio", "A module focused on unmet assistance need and the mismatch between eligible renter households and available vouchers."),
                ("PHA Performance", "A module focused on whether local administrative systems convert voucher assistance into actual leases."),
                ("Opportunity Gap", "A module focused on whether lease-up translates into neighborhood opportunity comparable to the broader renter population."),
            ]
        ),
        PageBreak(),
    ]

    story += [
        p("MODULE 1", "Kicker"),
        p("A National Interactive Data Platform", "PageTitle"),
        Rule(),
        Table(
            [
                [
                    [
                        p(
                            "This module functions as the project's empirical base. Instead of presenting a single fixed finding, it gives researchers a shared spatial interface for moving from broad national patterns to specific local conditions.",
                            "Body",
                        ),
                        p(
                            "The tool brings together HCV indicators and neighborhood context variables, allowing users to compare subsidized housing patterns, renter demographics, poverty, rent burden, local housing conditions, and related measures across multiple geographies.",
                            "Body",
                        ),
                    ],
                    img("images/interactive.png", 3.05 * inch),
                ]
            ],
            colWidths=[CONTENT_W - 3.25 * inch, 3.25 * inch],
        ),
        Spacer(1, 8),
        p("Why it matters", "Subhead"),
        p(
            "The platform is important because high-level program counts can hide the geography of access. A voucher system may appear administratively active while still leaving large renter populations underserved, concentrating assistance in specific neighborhoods, or operating differently across agencies and local markets. The interactive map makes these relationships inspectable rather than assumed.",
            "Body",
        ),
        p("Documentation", "Subhead"),
        bullet_table(
            [
                ("Methodology file", "Explains how the platform indicators were constructed and recalculated, including processing decisions needed to make the variables comparable across geographies."),
                ("Data dictionary", "Defines the variables, field names, and indicator meanings used in the interactive map, making the tool more transparent and reusable for research."),
            ]
        ),
        Spacer(1, 6),
        p(
            "Because the full platform is too large for GitHub deployment, the website provides a preview image and documentation downloads. The live tool still functions conceptually as the project's shared data infrastructure.",
            "Small",
        ),
        PageBreak(),
    ]

    story += [
        p("MODULE 2", "Kicker"),
        p("Opportunity Gap", "PageTitle"),
        Rule(),
        p(
            "The Opportunity Gap module asks what happens after a household successfully leases up. A lease is an important administrative outcome, but it does not automatically mean that the voucher delivered meaningful spatial choice. The next question is whether the household reached a neighborhood with opportunity conditions comparable to those available to renters overall.",
            "Body",
        ),
        Table(
            [
                [
                    [
                        p("Indicator construction", "Subhead"),
                        p(
                            "For each metropolitan area, tract-level Child Opportunity Index scores are averaged twice: once using HCV household counts as weights, and once using renter household counts as weights. The Opportunity Gap is the difference between the two exposure scores.",
                            "Body",
                        ),
                        p("<b>Opportunity Gap = HCV exposure - renter exposure</b>", "Body"),
                        p(
                            "Negative values indicate that HCV households are exposed to lower-opportunity neighborhoods than renters overall within the same metro area.",
                            "Small",
                        ),
                    ],
                    [
                        img("images/opportunity.png", 3.05 * inch, 1.9 * inch),
                        Spacer(1, 4),
                        p("Interactive map preview", "CenterLabel"),
                    ],
                ]
            ],
            colWidths=[CONTENT_W - 3.25 * inch, 3.25 * inch],
        ),
        Spacer(1, 7),
        Bars(),
        Spacer(1, 7),
        p("National pattern", "Subhead"),
        p(
            "Nationally, HCV households have an overall COI exposure score of 36.3, compared with 48.3 for renters overall. The resulting national gap is about -11.9 points, meaning voucher households are exposed to substantially lower opportunity environments than the broader renter population. This gap should not be read as household preference alone; it reflects search constraints, landlord gatekeeping, payment standards, administrative friction, and uneven rental supply.",
            "Body",
        ),
        PageBreak(),
    ]

    story += module_placeholder(
        "Group Module Page 1: Voucher Gap Ratio",
        "This module should explain how the project measures the mismatch between voucher supply and eligible renter need across geographies.",
        "Include the numerator, denominator, AMI thresholds, weighting groups, suppression rules, and the main spatial pattern visible in the map.",
    )
    story.append(PageBreak())

    story += module_placeholder(
        "Group Module Page 2: PHA Level Performance Metrics",
        "This module should explain how PHA-level administrative data are used to evaluate whether voucher assistance becomes actual lease-up capacity.",
        "Include utilization, success rate, cost per voucher, portability, reserve balance, data year, and the main interpretation of variation across PHAs.",
    )

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


if __name__ == "__main__":
    build()
    print(OUT)
