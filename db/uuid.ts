// Dependency-free UUID v4. schema.ts must not import any Expo/React Native runtime
// module (e.g. expo-crypto) — drizzle-kit's esbuild loader can't parse RN's Flow
// source when it statically loads the schema file to generate migrations.
export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
