import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.dirname(fileURLToPath(import.meta.url));

const lines = [
  "BT /F1 11 Tf 72 720 Td (Jane Doe - Senior Software Engineer) Tj ET",
  "BT /F1 11 Tf 72 704 Td (jane.doe@example.com | 555-123-4567 | linkedin.com/in/janedoe) Tj ET",
  "BT /F1 11 Tf 72 674 Td (SUMMARY) Tj ET",
  "BT /F1 11 Tf 72 658 Td (Backend engineer with 7 years building distributed systems.) Tj ET",
  "BT /F1 11 Tf 72 628 Td (EXPERIENCE) Tj ET",
  "BT /F1 11 Tf 72 612 Td (Staff Engineer, Acme Corp, Jan 2021 - Present) Tj ET",
  "BT /F1 11 Tf 72 596 Td (- Led 6 engineers and cut deploy time 40%) Tj ET",
  "BT /F1 11 Tf 72 580 Td (- Scaled the payments API to 12000 requests per second) Tj ET",
  "BT /F1 11 Tf 72 564 Td (- Reduced p99 latency from 800ms to 120ms) Tj ET",
  "BT /F1 11 Tf 72 548 Td (Senior Engineer, Globex, Mar 2018 - Dec 2020) Tj ET",
  "BT /F1 11 Tf 72 532 Td (- Built an event pipeline processing 2M events daily) Tj ET",
  "BT /F1 11 Tf 72 516 Td (- Mentored four junior engineers) Tj ET",
  "BT /F1 11 Tf 72 486 Td (EDUCATION) Tj ET",
  "BT /F1 11 Tf 72 470 Td (BS Computer Science, State University, 2018) Tj ET",
  "BT /F1 11 Tf 72 440 Td (SKILLS) Tj ET",
  "BT /F1 11 Tf 72 424 Td (TypeScript, React, Postgres, Kubernetes, Go, AWS) Tj ET",
];

const content = lines.join("\n");

const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

let pdf = "%PDF-1.4\n";
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
offsets.forEach((o) => {
  pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
});
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

fs.writeFileSync(path.join(outDir, "sample-resume.pdf"), Buffer.from(pdf, "latin1"));

// An "image-only" PDF: a valid page with no text-drawing operators at all.
const imgContent = "0.5 0.5 0.5 rg 100 100 400 600 re f";
const imgObjs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
  `<< /Length ${imgContent.length} >>\nstream\n${imgContent}\nendstream`,
];
let img = "%PDF-1.4\n";
const imgOffsets = [];
imgObjs.forEach((o, i) => {
  imgOffsets.push(img.length);
  img += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const imgXref = img.length;
img += `xref\n0 ${imgObjs.length + 1}\n0000000000 65535 f \n`;
imgOffsets.forEach((o) => {
  img += `${String(o).padStart(10, "0")} 00000 n \n`;
});
img += `trailer\n<< /Size ${imgObjs.length + 1} /Root 1 0 R >>\nstartxref\n${imgXref}\n%%EOF`;

fs.writeFileSync(path.join(outDir, "scanned-resume.pdf"), Buffer.from(img, "latin1"));

console.log("wrote sample-resume.pdf and scanned-resume.pdf to", outDir);
