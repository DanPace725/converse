// One capability table shared by server and UI. Unknown models use defaults.
export function effortLevels(provider, model) {
  if (provider === 'openai' && model === 'gpt-6-astra') return ['low', 'medium', 'high', 'xhigh', 'max'];
  if (provider === 'openai') return model === 'gpt-6.1-sol'
    ? ['low', 'medium', 'high'] : ['none', 'low', 'medium', 'high'];
  if (/claude-(?:fable|mythos)|claude-(?:opus|sonnet)-(?:5|4-[789])/.test(model))
    return ['default', 'low', 'medium', 'high', 'xhigh', 'max'];
  if (/claude-(?:opus|sonnet)-4-6/.test(model)) return ['default', 'low', 'medium', 'high', 'max'];
  if (/claude-opus-4-5/.test(model)) return ['default', 'low', 'medium', 'high'];
  return ['default'];
}
