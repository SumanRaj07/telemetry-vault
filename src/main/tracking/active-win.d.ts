// active-win is an optional dependency: it is only installed on Windows
// (where its prebuilt binary exists) and is never required on other
// platforms. This declaration keeps TypeScript happy when it is absent;
// at runtime the provider checks availability before importing it.
declare module 'active-win' {
  const activeWin: () => Promise<
    | {
        title: string;
        owner: { name: string; processId: number; path: string };
      }
    | undefined
  >;
  export default activeWin;
}
