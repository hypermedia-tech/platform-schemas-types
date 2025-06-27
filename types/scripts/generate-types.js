#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { compileFromFile } = require('json-schema-to-typescript');

async function generateTypes() {
    const chartsDir = path.join(__dirname, '../../charts');
    const srcDir = path.join(__dirname, '../src');

    // Clean and create src directory
    if (fs.existsSync(srcDir)) {
        fs.rmSync(srcDir, { recursive: true });
    }
    fs.mkdirSync(srcDir, { recursive: true });

    // Find all charts with values.schema.json
    const chartDirs = fs.readdirSync(chartsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(chartName => {
            const schemaPath = path.join(chartsDir, chartName, 'values.schema.json');
            return fs.existsSync(schemaPath);
        });

    console.log(`Found ${chartDirs.length} charts with schemas:`, chartDirs);

    const workloadTypes = [];
    const exports = [];

    // Generate types for each chart
    for (const chartName of chartDirs) {
        const schemaPath = path.join(chartsDir, chartName, 'values.schema.json');
        const outputPath = path.join(srcDir, `${chartName}.ts`);

        console.log(`Generating types for ${chartName}...`);

        try {
            // Read schema to extract workload type
            const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
            const workloadType = schema.properties?.workloadType?.const;

            if (workloadType) {
                workloadTypes.push(workloadType);
                console.log(`  Found workload type: ${workloadType}`);
            }

            // Generate TypeScript interface
            const ts = await compileFromFile(schemaPath, {
                additionalProperties: false,
                style: {
                    singleQuote: true,
                },
                bannerComment: `/**
 * Generated types for ${chartName} Helm chart
 * DO NOT EDIT - This file is auto-generated from values.schema.json
 */`,
            });

            fs.writeFileSync(outputPath, ts);
            exports.push(`export * from './${chartName}';`);

            console.log(`  ✓ Generated ${outputPath}`);
        } catch (error) {
            console.error(`  ✗ Failed to generate types for ${chartName}:`, error.message);
            process.exit(1);
        }
    }

    // Generate WorkloadType enum
    if (workloadTypes.length > 0) {
        const enumContent = `/**
 * Auto-generated workload type enumeration
 * DO NOT EDIT - This file is auto-generated from chart schemas
 */

export enum WorkloadType {
${workloadTypes.map(type => `  ${type} = '${type}',`).join('\n')}
}

export type WorkloadTypeString = \`\${WorkloadType}\`;
`;

        fs.writeFileSync(path.join(srcDir, 'workload-types.ts'), enumContent);
        exports.push("export * from './workload-types';");
        console.log(`✓ Generated WorkloadType enum with ${workloadTypes.length} types`);
    }

    // Generate index.ts
    const indexContent = `/**
 * Auto-generated barrel export for workload schemas
 * DO NOT EDIT - This file is auto-generated
 */

${exports.join('\n')}
`;

    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent);
    console.log(`✓ Generated index.ts with ${exports.length} exports`);

    console.log('\n🎉 Type generation complete!');
}

generateTypes().catch(error => {
    console.error('Type generation failed:', error);
    process.exit(1);
});