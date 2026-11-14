import { describe, expect, it } from "vitest";
import {
  computeFeatureVector,
  experienceMatchScore,
  groundSkills,
  locationMatchScore,
  skillMatch,
  type OpeningRequirements,
} from "../../../src/services/recommendation/engines/matchingEngine";
import { normalizeSkills } from "../../../src/services/recommendation/engines/skillNormalizer";

describe("experience match (boundaries)", () => {
  // Opening asks for 3–6 years.
  it.each([
    [0, 0],
    [2, 0],
    [2.99, 0], // just below min
    [3, 1], // exactly min
    [4.5, 1],
    [6, 1], // exactly max
    [6.01, 0.8], // just above max
    [15, 0.8],
  ])("%s years → %s", (years, expected) => {
    expect(experienceMatchScore(years, 3, 6)).toBe(expected);
  });

  it("open-ended range (no max) never penalises seniority", () => {
    expect(experienceMatchScore(30, 5, null)).toBe(1);
    expect(experienceMatchScore(4, 5, null)).toBe(0);
  });

  it("min = 0 accepts freshers", () => {
    expect(experienceMatchScore(0, 0, 2)).toBe(1);
  });
});

describe("skill overlap accuracy", () => {
  const required = ["Node.js", "TypeScript", "PostgreSQL", "Docker"];

  it("full overlap → 1", () => {
    expect(skillMatch(required, required).score).toBe(1);
  });

  it("no overlap → 0 and lists every missing skill", () => {
    const r = skillMatch(["Figma"], required);
    expect(r.score).toBe(0);
    expect(r.missing).toEqual(required);
  });

  it("partial overlap = matched / required", () => {
    const r = skillMatch(["Node.js", "TypeScript", "Docker"], required);
    expect(r.score).toBe(0.75);
    expect(r.matched).toEqual(["Node.js", "TypeScript", "Docker"]);
    expect(r.missing).toEqual(["PostgreSQL"]);
  });

  it("rounds to 4 decimals (1/3)", () => {
    expect(skillMatch(["Go"], ["Go", "Rust", "C"]).score).toBe(0.3333);
  });

  it("aliases and casing count as the same skill", () => {
    const r = skillMatch(["nodejs", "TS", "postgres", "DOCKER"], required);
    expect(r.score).toBe(1);
  });

  it("duplicates and extra candidate skills do not inflate the score", () => {
    const r = skillMatch(["Node", "node.js", "NodeJS", "Kafka", "Redis"], required);
    expect(r.score).toBe(0.25);
  });

  it("no required skills → 1 (nothing to miss)", () => {
    expect(skillMatch(["Java"], []).score).toBe(1);
  });

  it("normalizer maps variants to one canonical name", () => {
    expect(normalizeSkills(["ReactJS", "react.js", "k8s", "AWS (EC2, S3)"]).normalized).toEqual([
      "React",
      "Kubernetes",
      "AWS",
    ]);
  });
});

describe("location logic", () => {
  it("remote opening → 1 for any candidate", () => {
    expect(locationMatchScore("Chennai", "Remote", "remote")).toBe(1);
    expect(locationMatchScore("", "Remote (India)", "remote")).toBe(1);
  });

  it("exact city match → 1 (case/punctuation-insensitive)", () => {
    expect(locationMatchScore("bangalore, KA, India", "Bangalore", "onsite")).toBe(1);
  });

  it("city aliases match (Bengaluru = Bangalore, Gurgaon = Gurugram)", () => {
    expect(locationMatchScore("Bengaluru", "Bangalore", "onsite")).toBe(1);
    expect(locationMatchScore("Gurgaon, Haryana", "Gurugram", "onsite")).toBe(1);
  });

  it("onsite mismatch → 0.5", () => {
    expect(locationMatchScore("Mumbai", "Bangalore", "onsite")).toBe(0.5);
  });

  it("missing candidate location → 0.5 (unknown, not a match)", () => {
    expect(locationMatchScore("", "Bangalore", "onsite")).toBe(0.5);
  });

  it("partial words are not a city match", () => {
    expect(locationMatchScore("New Delhite", "Delhi", "onsite")).toBe(0.5);
  });
});

describe("feature vector", () => {
  const req: OpeningRequirements = {
    title: "Backend",
    requiredSkills: ["Node.js", "PostgreSQL"],
    experienceMin: 2,
    experienceMax: 5,
    location: "Pune",
    workMode: "onsite",
  };

  it("combines all three deterministic signals", () => {
    const fv = computeFeatureVector({ experienceYears: 8, skills: ["node"], location: "Pune" }, req);
    expect(fv).toMatchObject({
      skillMatchScore: 0.5,
      experienceMatchScore: 0.8,
      locationMatchScore: 1,
      matchedSkills: ["Node.js"],
      missingSkills: ["PostgreSQL"],
    });
  });
});

describe("skill grounding (anti-hallucination)", () => {
  it("drops skills that never appear in the resume text", () => {
    const text = "Worked 4 years with Node.js and Postgres on AWS.";
    const r = groundSkills(["Node.js", "PostgreSQL", "AWS", "Kubernetes"], text);
    expect(r.grounded).toEqual(["Node.js", "PostgreSQL", "AWS"]);
    expect(r.ungrounded).toEqual(["Kubernetes"]);
  });

  it("requires whole-word evidence (Java ≠ JavaScript)", () => {
    expect(groundSkills(["Java"], "Expert in JavaScript").grounded).toEqual([]);
  });
});
