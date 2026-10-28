import { defineConfig, devices } from '@playwright/test'

declare const process: { env: Record<string, string | undefined> }

// Browser test: plays the real built client against a running Guildie API (CI: a throwaway PHP + MySQL server).
//   GUILDIE_URL=http://127.0.0.1:8080/games/guildie/ npx playwright test
// Run the server with a fast pace (pace.time_multiplier 0.05) so crafts finish in seconds.
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.GUILDIE_URL || 'http://127.0.0.1:8080/games/guildie/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    // Desktop gets the 3D harbor: CI has no GPU, so WebGL runs in software (SwiftShader).
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 860 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
})
