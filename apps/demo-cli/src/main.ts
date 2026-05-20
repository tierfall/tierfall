function main(): void {
  console.log(
    '[tierfall demo] Scaffolding complete. Scenario logic ships in issue #9.\n' +
      '[tierfall demo] Configured adapters from env:',
  );
  console.log({
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? '(not set)',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***set***' : '(not set)',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***set***' : '(not set)',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? '***set***' : '(not set)',
  });
}

main();
