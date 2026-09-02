import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres.iibjzcbzhktmtdretsxy:sQ6y%213%21M%2F7KAVqy@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres' });

async function main() {
  await client.connect();

  const { rows: attempts } = await client.query('SELECT * FROM "generation_attempts" ORDER BY "started_at" DESC LIMIT 5');
  if (!attempts.length) {
    console.log('No attempts found');
    return;
  }

  for (const attempt of attempts) {
    console.log(`\n=== Attempt ${attempt.id} ===`);
    console.log('Summary:', attempt.validation_summary);
    
    const { rows: toolCalls } = await client.query('SELECT * FROM "generation_tool_calls" WHERE "attempt_id" = $1 ORDER BY "sequence"', [attempt.id]);
    
    for (const call of toolCalls) {
      console.log(`Tool: ${call.tool_name} - ${call.status}`);
      console.log('Output:', JSON.stringify(call.output_summary));
      if (call.input_summary) console.log('Input:', JSON.stringify(call.input_summary));
    }
  }

  await client.end();
}

main().catch(console.error);
