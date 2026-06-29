import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/utils/mapper.js', 'utf8');

content = content.replace(
  'return mapped;',
  `
    // Pre-Flight Validation Check
    if (!mapped.email || mapped.email.trim() === '') {
      mapped._is_invalid = true;
      mapped._validation_reason = 'Critically missing CRM-required field: email';
    }

    return mapped;
`
);

writeFileSync('src/utils/mapper.js', content, 'utf8');
