/**
 * Deterministic skill normalization: maps spelling variants and aliases to
 * one canonical name ("ReactJS", "react.js" → "React"), so skill overlap is
 * computed on comparable values.
 */

const CANONICAL_SKILLS: Record<string, string[]> = {
  "JavaScript": ["js", "javascript", "ecmascript", "es6"],
  "TypeScript": ["ts", "typescript"],
  "Node.js": ["node", "nodejs", "node.js"],
  "React": ["react", "reactjs", "react.js"],
  "React Native": ["reactnative", "react-native", "rn"],
  "Next.js": ["next", "nextjs", "next.js"],
  "Redux": ["redux", "reduxtoolkit", "rtk"],
  "Express": ["express", "expressjs", "express.js"],
  "Angular": ["angular", "angularjs"],
  "Vue.js": ["vue", "vuejs", "vue.js"],
  "HTML": ["html", "html5"],
  "CSS": ["css", "css3"],
  "HTML/CSS": ["html/css", "htmlcss"],
  "Tailwind CSS": ["tailwind", "tailwindcss"],
  "Python": ["python", "python3", "py"],
  "Django": ["django"],
  "Flask": ["flask"],
  "FastAPI": ["fastapi"],
  "Java": ["java", "corejava"],
  "Spring Boot": ["springboot", "spring"],
  "Microservices": ["microservices", "microservice", "microservicearchitecture"],
  "Kafka": ["kafka", "apachekafka"],
  "Go": ["go", "golang"],
  "C#": ["c#", "csharp"],
  ".NET": [".net", "dotnet", "netcore", "aspnet"],
  "SQL": ["sql"],
  "PostgreSQL": ["postgresql", "postgres", "psql"],
  "MySQL": ["mysql"],
  "MongoDB": ["mongodb", "mongo"],
  "Redis": ["redis"],
  "Docker": ["docker", "containers", "containerization"],
  "Kubernetes": ["kubernetes", "k8s"],
  "Terraform": ["terraform"],
  "AWS": ["aws", "amazonwebservices"],
  "Azure": ["azure", "microsoftazure"],
  "GCP": ["gcp", "googlecloud", "googlecloudplatform"],
  "CI/CD": ["ci/cd", "cicd", "continuousintegration"],
  "Jenkins": ["jenkins"],
  "Git": ["git", "github", "gitlab"],
  "Linux": ["linux", "unix"],
  "Networking": ["networking", "tcp/ip"],
  "Prometheus": ["prometheus"],
  "Grafana": ["grafana"],
  "Apache Spark": ["spark", "apachespark", "pyspark"],
  "Airflow": ["airflow", "apacheairflow"],
  "PyTorch": ["pytorch", "torch"],
  "TensorFlow": ["tensorflow", "tf"],
  "scikit-learn": ["scikit-learn", "scikitlearn", "sklearn"],
  "Selenium": ["selenium", "seleniumwebdriver"],
  "TestNG": ["testng"],
  "REST Assured": ["restassured", "rest-assured"],
  "REST APIs": ["rest", "restapi", "restapis", "restful", "restfulapis"],
  "Figma": ["figma"],
  "User Research": ["userresearch", "uxresearch"],
  "Prototyping": ["prototyping", "prototype"],
  "Design Systems": ["designsystems", "designsystem"],
  "Power BI": ["powerbi"],
  "Excel": ["excel", "msexcel", "microsoftexcel"],
  "Data Modeling": ["datamodeling", "datamodelling"],
};

/** Lowercase and drop separators, keeping chars that distinguish skills (#, +, /). */
export function skillKey(skill: string): string {
  return skill.toLowerCase().trim().replace(/[\s_\-]+/g, "");
}

const ALIAS_INDEX = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(CANONICAL_SKILLS)) {
  ALIAS_INDEX.set(skillKey(canonical), canonical);
  for (const a of aliases) ALIAS_INDEX.set(skillKey(a), canonical);
}

export interface SkillMapping {
  input: string;
  canonical: string;
  known: boolean;
}

export function normalizeSkill(skill: string): SkillMapping {
  const trimmed = skill.trim().replace(/\s+/g, " ");
  const lookup = (s: string) => {
    const key = skillKey(s);
    return ALIAS_INDEX.get(key) ?? ALIAS_INDEX.get(key.replace(/\./g, ""));
  };
  // "AWS (EC2, S3)" → try "AWS" when the full string is not a known alias.
  const canonical = lookup(trimmed) ?? lookup(trimmed.replace(/\s*\(.*?\)\s*/g, " "));
  return canonical
    ? { input: skill, canonical, known: true }
    : { input: skill, canonical: trimmed, known: false };
}

export function normalizeSkills(skills: string[]) {
  const mappings = skills
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .map(normalizeSkill);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const m of mappings) {
    const k = m.canonical.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      normalized.push(m.canonical);
    }
  }
  return {
    normalized,
    unknown: mappings.filter((m) => !m.known).map((m) => m.input),
    mappings,
  };
}

/** All spellings that count as evidence of a canonical skill in raw text. */
export function aliasesOf(canonical: string): string[] {
  return [canonical, ...(CANONICAL_SKILLS[canonical] ?? [])];
}
