const source = Bun.file('package.json');
if (!(await source.exists())) throw new Error('package.json was not found.');
await Bun.write('build/package.json', source);
