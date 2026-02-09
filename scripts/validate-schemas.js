const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const Ajv = require("ajv/dist/2020");

const chartsDir = path.resolve(__dirname, "..", "charts");
const ajv = new Ajv({ allErrors: true, strict: false });

const chartDirs = fs
  .readdirSync(chartsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let failed = false;

for (const chart of chartDirs) {
  const schemaPath = path.join(chartsDir, chart, "values.schema.json");
  const valuesPath = path.join(chartsDir, chart, "values.yaml");

  if (!fs.existsSync(schemaPath)) {
    console.warn(`SKIP  ${chart} - no values.schema.json`);
    continue;
  }
  if (!fs.existsSync(valuesPath)) {
    console.warn(`SKIP  ${chart} - no values.yaml`);
    continue;
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const values = yaml.load(fs.readFileSync(valuesPath, "utf8"));
  const validate = ajv.compile(schema);
  const valid = validate(values);

  if (valid) {
    console.log(`PASS  ${chart}`);
  } else {
    console.error(`FAIL  ${chart}`);
    for (const err of validate.errors) {
      console.error(`      ${err.instancePath || "/"} ${err.message}`);
    }
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("\nAll chart values validated successfully.");
