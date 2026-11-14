import prisma from "../config/prisma/prisma.js";
import type { OpeningStatus } from "@prisma/client";

/**
 * Seeds the database with contract openings for the "Bruce Wayne Corp" tenant.
 *
 * - Idempotent: the tenant is found-or-created by name, and an opening is
 *   skipped if one with the same title already exists for that tenant.
 * - Openings are assigned round-robin to the tenant's HIRING_MANAGER users,
 *   so register at least one hiring manager under this tenant before seeding.
 * - Each description ends with a "Required skills:" line. The recommendation
 *   agent reads required skills from this line, since the Opening model has
 *   no dedicated skills column.
 *
 * Run: npm run seed:openings
 */

const TENANT_NAME = "Bruce Wayne Corp";

interface SeedOpening {
  title: string;
  summary: string;
  requiredSkills: string[];
  location: string;
  contractType: string;
  experienceMin: number;
  experienceMax: number | null;
  status?: OpeningStatus;
  /** Days from now until the expected completion date. */
  completesInDays: number;
}

const OPENINGS: SeedOpening[] = [
  {
    title: "Senior Backend Engineer",
    summary:
      "Design and build scalable REST APIs and background workers for our core platform.",
    requiredSkills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS"],
    location: "Bangalore",
    contractType: "Full-time Contract",
    experienceMin: 5,
    experienceMax: 9,
    completesInDays: 180,
  },
  {
    title: "Frontend Developer",
    summary:
      "Build responsive, accessible dashboards with a modern React stack.",
    requiredSkills: ["React", "Next.js", "JavaScript", "Tailwind CSS", "Redux"],
    location: "Remote",
    contractType: "Full-time Contract",
    experienceMin: 2,
    experienceMax: 5,
    completesInDays: 120,
  },
  {
    title: "Full Stack Engineer",
    summary:
      "Own features end to end across a Node.js backend and React frontend.",
    requiredSkills: ["React", "Node.js", "Express", "MongoDB", "TypeScript"],
    location: "Hyderabad",
    contractType: "Contract-to-Hire",
    experienceMin: 3,
    experienceMax: 6,
    completesInDays: 150,
  },
  {
    title: "Data Engineer",
    summary:
      "Build and maintain batch and streaming data pipelines for analytics.",
    requiredSkills: ["Python", "Apache Spark", "SQL", "Airflow", "AWS"],
    location: "Pune",
    contractType: "Full-time Contract",
    experienceMin: 3,
    experienceMax: 7,
    completesInDays: 200,
  },
  {
    title: "DevOps Engineer",
    summary:
      "Automate infrastructure and CI/CD for containerised microservices.",
    requiredSkills: ["Kubernetes", "Docker", "Terraform", "AWS", "CI/CD"],
    location: "Remote",
    contractType: "Fixed-term (6 months)",
    experienceMin: 4,
    experienceMax: 8,
    completesInDays: 180,
  },
  {
    title: "QA Automation Engineer",
    summary:
      "Create and maintain automated UI and API test suites.",
    requiredSkills: ["Selenium", "Java", "TestNG", "REST Assured", "Jenkins"],
    location: "Chennai",
    contractType: "Full-time Contract",
    experienceMin: 2,
    experienceMax: 5,
    completesInDays: 90,
  },
  {
    title: "Machine Learning Engineer",
    summary:
      "Train, evaluate and deploy ML models for recommendation and ranking.",
    requiredSkills: ["Python", "PyTorch", "scikit-learn", "SQL", "Docker"],
    location: "Bangalore",
    contractType: "Contract-to-Hire",
    experienceMin: 3,
    experienceMax: 8,
    completesInDays: 240,
  },
  {
    title: "Mobile Developer (React Native)",
    summary:
      "Ship cross-platform mobile features for our customer app.",
    requiredSkills: ["React Native", "JavaScript", "TypeScript", "Redux", "REST APIs"],
    location: "Mumbai",
    contractType: "Part-time Contract",
    experienceMin: 2,
    experienceMax: 4,
    completesInDays: 100,
  },
  {
    title: "Cloud Architect",
    summary:
      "Define cloud architecture, security baselines and cost governance.",
    requiredSkills: ["AWS", "Azure", "Terraform", "Kubernetes", "Networking"],
    location: "Remote",
    contractType: "Fixed-term (12 months)",
    experienceMin: 8,
    experienceMax: 15,
    completesInDays: 365,
  },
  {
    title: "Java Spring Boot Developer",
    summary:
      "Develop and maintain enterprise microservices on Spring Boot.",
    requiredSkills: ["Java", "Spring Boot", "Microservices", "MySQL", "Kafka"],
    location: "Hyderabad",
    contractType: "Full-time Contract",
    experienceMin: 4,
    experienceMax: 8,
    completesInDays: 180,
  },
  {
    title: "UI/UX Designer",
    summary:
      "Design user flows, wireframes and high-fidelity prototypes.",
    requiredSkills: ["Figma", "User Research", "Prototyping", "Design Systems", "HTML/CSS"],
    location: "Pune",
    contractType: "Part-time Contract",
    experienceMin: 1,
    experienceMax: 4,
    completesInDays: 60,
  },
  {
    title: "Junior Python Developer",
    summary:
      "Build internal tools and APIs under the guidance of senior engineers.",
    requiredSkills: ["Python", "Django", "SQL", "Git"],
    location: "Chennai",
    contractType: "Contract-to-Hire",
    experienceMin: 0,
    experienceMax: 2,
    completesInDays: 120,
  },
  {
    title: "Site Reliability Engineer",
    summary:
      "Improve reliability, observability and incident response for production systems.",
    requiredSkills: ["Linux", "Prometheus", "Grafana", "Kubernetes", "Go"],
    location: "Bangalore",
    contractType: "Full-time Contract",
    experienceMin: 5,
    experienceMax: null,
    status: "ON_HOLD",
    completesInDays: 210,
  },
  {
    title: "Business Intelligence Analyst",
    summary:
      "Build dashboards and reports that drive business decisions.",
    requiredSkills: ["Power BI", "SQL", "Excel", "Data Modeling"],
    location: "Mumbai",
    contractType: "Fixed-term (6 months)",
    experienceMin: 2,
    experienceMax: 6,
    status: "CLOSED",
    completesInDays: 30,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function buildDescription(o: SeedOpening): string {
  return `${o.summary}\n\nRequired skills: ${o.requiredSkills.join(", ")}`;
}

/**
 * Seeds the database with sample job openings for testing purposes.
 */
async function seedOpenings() {
  try {
    console.log("🌱 Seeding openings data...");

    const tenant =
      (await prisma.tenants.findFirst({ where: { companyName: TENANT_NAME } })) ??
      (await prisma.tenants.create({ data: { companyName: TENANT_NAME } }));
    console.log(`🏢 Tenant: ${tenant.companyName} (${tenant.tenantId})`);

    const managers = await prisma.user.findMany({
      where: { tenantId: tenant.tenantId, role: "HIRING_MANAGER" },
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true },
    });
    if (managers.length === 0) {
      throw new Error(
        `No HIRING_MANAGER users found in tenant "${TENANT_NAME}". Register one first.`
      );
    }
    console.log(
      `👤 Hiring managers: ${managers.map((m) => m.username ?? m.id).join(", ")}`
    );

    let created = 0;
    let skipped = 0;
    const now = Date.now();

    await prisma.$transaction(async (tx) => {
      for (const [i, o] of OPENINGS.entries()) {
        const exists = await tx.opening.findFirst({
          where: { tenantId: tenant.tenantId, title: o.title },
          select: { id: true },
        });
        if (exists) {
          skipped++;
          continue;
        }

        const manager = managers[i % managers.length];
        // Spread posted dates over the last few weeks so sorting is meaningful.
        const postedDate = new Date(now - (OPENINGS.length - i) * 2 * DAY_MS);

        await tx.opening.create({
          data: {
            tenantId: tenant.tenantId,
            title: o.title,
            description: buildDescription(o),
            location: o.location,
            contractType: o.contractType,
            hiringManagerId: manager.id,
            experienceMin: o.experienceMin,
            experienceMax: o.experienceMax,
            postedDate,
            expectedCompletionDate: new Date(now + o.completesInDays * DAY_MS),
            status: o.status ?? "OPEN",
          },
        });
        created++;
      }
    });

    console.log(`✅ Openings created: ${created}, already present: ${skipped}`);
  } catch (error) {
    console.error("❌ Error seeding openings:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedOpenings();
