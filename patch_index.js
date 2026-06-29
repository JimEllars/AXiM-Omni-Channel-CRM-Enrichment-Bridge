import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/index.js', 'utf8');

const target1 = `     // Align CRM Schema for Deskera
     const mappedRecords = formatForDeskera(uniqueRecords);`;

const replacement1 = `     // Align CRM Schema for Deskera
     const mappedRecords = formatForDeskera(uniqueRecords);

     const validRecords = [];
     const invalidRecords = [];

     for (const record of mappedRecords) {
         if (record._is_invalid) {
             invalidRecords.push(record);
         } else {
             validRecords.push(record);
         }
     }

     if (invalidRecords.length > 0) {
         await logToRecovery(env, source, "Pre-Flight Validation Failed", {
             destination: 'DLQ',
             original: uniqueRecords.filter((_, i) => mappedRecords[i]._is_invalid),
             mapped: invalidRecords
         });
         await logTelemetry(env, 'PRE_FLIGHT_VALIDATION_FAILED', 'HIGH', \`\${invalidRecords.length} records failed pre-flight validation.\`);
     }

     if (validRecords.length === 0) return;`;

content = content.replace(target1, replacement1);

// Need to change dispatchPayload to use validRecords
const target2 = `     const dispatchPayload = {
         metadata: { source: source, processed_at: new Date().toISOString() },
         data: mappedRecords
     };`;

const replacement2 = `     const dispatchPayload = {
         metadata: { source: source, processed_at: new Date().toISOString() },
         data: validRecords
     };`;

content = content.replace(target2, replacement2);

writeFileSync('src/index.js', content, 'utf8');
