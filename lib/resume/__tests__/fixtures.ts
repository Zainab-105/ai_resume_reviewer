/**
 * Fixture resumes with expected score ranges. These are the regression net for
 * the deterministic scorer — if a rubric tweak moves a fixture out of its
 * band, the change needs justifying rather than merging.
 */

export interface Fixture {
  name: string;
  text: string;
  pageCount: number;
  fileName: string;
  /** Inclusive ATS score band this resume should land in. */
  expectAts: [number, number];
  /** Red-flag ids that must be present. */
  expectFlags: string[];
  /** Red-flag ids that must NOT be present. */
  forbidFlags: string[];
}

const strong = `Jane Doe - Senior Software Engineer
jane.doe@example.com | 555-123-4567 | linkedin.com/in/janedoe
SUMMARY
Backend engineer with 7 years building distributed systems.
EXPERIENCE
Staff Engineer, Acme Corp, Jan 2021 - Present
- Led 6 engineers and cut deploy time 40%
- Scaled the payments API to 12000 requests per second
- Reduced p99 latency from 800ms to 120ms
- Saved $240k annually by right-sizing infrastructure
Senior Engineer, Globex, Mar 2018 - Dec 2020
- Built an event pipeline processing 2M events daily
- Mentored four junior engineers
EDUCATION
BS Computer Science, State University, 2018
SKILLS
TypeScript, React, Postgres, Kubernetes, Go, AWS`;

const weak = `Bobby
partyboy420@hotmail.com
I am a results-driven team player and self-starter with a passion for synergy.
I worked at some places doing various things.
I am a hard worker and a rockstar developer.
My experience includes working on projects and helping the team.
linkedin.com/in/`;

const gappy = `Sam Patel
sam.patel@example.com | 555-987-6543
EXPERIENCE
Engineer, Initech, Jan 2015 - Mar 2017
- Shipped 15 features across the billing surface
- Improved test coverage to 85%
- Cut build times by 30%
- Handled 200 support tickets
- Migrated 40 services to the new platform
Engineer, Umbrella, Sep 2019 - Present
- Built internal tools
EDUCATION
BS Computer Science, University, 2014
SKILLS
Python, Django, Postgres`;

const mixedDates = `Alex Kim
alex.kim@example.com | 555-222-3333
SUMMARY
Product designer.
EXPERIENCE
Designer, Acme, Jan 2020 - 12/2022
- Ran 30 usability sessions
- Lifted activation 18%
- Cut support tickets by 25%
- Shipped 12 design systems components
- Reduced onboarding drop-off 40%
Designer, Globex, 2017 - 03/2019
- Redesigned the checkout flow
EDUCATION
BA Design, College, 2016
SKILLS
Figma, prototyping`;

export const fixtures: Fixture[] = [
  {
    name: "strong single-column engineer resume",
    text: strong,
    pageCount: 1,
    fileName: "Jane-Doe-Resume.pdf",
    expectAts: [90, 100],
    expectFlags: [],
    forbidFlags: ["no-email", "no-dates", "buzzwords", "unprofessional-email"],
  },
  {
    name: "weak buzzword resume with no structure",
    text: weak,
    pageCount: 1,
    fileName: "resume final copy (2).pdf",
    expectAts: [0, 45],
    expectFlags: ["unprofessional-email", "buzzwords", "no-dates", "filename"],
    forbidFlags: ["no-email"],
  },
  {
    name: "solid resume with a 30-month employment gap",
    text: gappy,
    pageCount: 3,
    fileName: "sam_resume.pdf",
    // Parses cleanly, so it scores high on ATS mechanics. The gap is a
    // red flag, deliberately kept out of the parsing rubric.
    expectAts: [70, 95],
    expectFlags: ["gap-1"],
    forbidFlags: ["no-email", "no-dates"],
  },
  {
    name: "resume mixing Mon-YYYY and MM/YYYY dates",
    text: mixedDates,
    pageCount: 1,
    fileName: "Alex-Kim-Resume.pdf",
    expectAts: [70, 95],
    expectFlags: [],
    forbidFlags: ["no-dates", "no-email"],
  },
];
