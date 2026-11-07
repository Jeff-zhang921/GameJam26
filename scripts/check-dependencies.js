const manifest = await Bun.file(new URL('../package.json', import.meta.url)).json();
const lock = await Bun.file(new URL('../package-lock.json', import.meta.url)).json();
const dependencyGroups = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
if (dependencyGroups.some(group => Object.keys(manifest[group] || {}).length) || manifest.workspaces?.length || Object.keys(lock.packages || {}).some(path => path !== '')) {
  throw new Error('Docker currently expects the dependency-free application. Add a committed Bun lockfile and frozen install before introducing dependencies.');
}
if (lock.name !== manifest.name || lock.version !== manifest.version) throw new Error('package-lock.json does not match package.json.');
console.log('Verified dependency-free package and lockfile.');
