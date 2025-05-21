import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { getGithubCopilotOauthToken, refreshCopilotToken, getCachedCopilotToken } from '../src/utils/copilot-auth.js';

// Mock fs and os modules
vi.mock('node:fs');
vi.mock('node:os');

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));


describe('getGithubCopilotOauthToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('Test case 1.1: GITHUB_COPILOT_OAUTH_TOKEN environment variable is set', () => {
    process.env.GITHUB_COPILOT_OAUTH_TOKEN = 'TOKEN_FROM_ENV';
    expect(getGithubCopilotOauthToken()).toBe('TOKEN_FROM_ENV');
    delete process.env.GITHUB_COPILOT_OAUTH_TOKEN;
  });

  it('Test case 1.2: Reading from hosts.json (Linux/macOS path)', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ "github.com": { "oauth_token": "TOKEN_FROM_FILE" } })
    );
    expect(getGithubCopilotOauthToken()).toBe('TOKEN_FROM_FILE');
  });

  it('Test case 1.3: Reading from hosts.json (Windows path)', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\user');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ "github.com:AppId": { "oauth_token": "TOKEN_FROM_WIN_FILE" } })
    );
    expect(getGithubCopilotOauthToken()).toBe('TOKEN_FROM_WIN_FILE');
  });

  it('Test case 1.4: hosts.json does not exist', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(getGithubCopilotOauthToken()).toBeUndefined();
  });

  it('Test case 1.5: hosts.json is malformed', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{'); // Invalid JSON
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getGithubCopilotOauthToken()).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('Test case 1.6: hosts.json is valid JSON but no token', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ "someotherkey": { "data": "value" } })
    );
    expect(getGithubCopilotOauthToken()).toBeUndefined();
  });
});

describe('refreshCopilotToken and getCachedCopilotToken', () => {
  const fetch = vi.mocked(global.fetch); // For node-fetch v3+ it's usually just fetch

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset cache state by directly manipulating module-level variables
    // This is a bit of a hack; ideally, the module would provide a reset function for tests.
    // For this example, we'll assume we can't modify copilot-auth.ts to add a resetter.
    // Instead, we'll rely on the fact that `refreshCopilotToken` clears the cache on failure
    // and sets it on success. We can also re-import or use vi.resetModules if needed,
    // but for now, let's see if careful mocking of getGithubCopilotOauthToken and fetch is enough.
    // The following lines are pseudo-code for what we'd ideally do:
    // import * as CopilotAuth from '../src/utils/copilot-auth.js';
    // CopilotAuth.currentApiKey = undefined;
    // CopilotAuth.currentApiKeyExpiresAt = undefined;
    // Since we can't directly set them from here without modifying the source or complex module manipulation,
    // we will ensure tests manage state via mocks and observed behavior.
  });

   // Mock getGithubCopilotOauthToken from the same module
  vi.mock('../src/utils/copilot-auth.js', async (importOriginal) => {
    const originalModule = await importOriginal();
    return {
      ...originalModule,
      getGithubCopilotOauthToken: vi.fn(),
    };
  });
  const getGithubCopilotOauthTokenMock = vi.mocked(getGithubCopilotOauthToken);


  it('Test case 2.1: refreshCopilotToken - successful refresh', async () => {
    getGithubCopilotOauthTokenMock.mockReturnValue('DUMMY_OAUTH_TOKEN');
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600;
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'NEW_API_KEY', expires_at: expiresAtSeconds }),
    } as Response);

    const result = await refreshCopilotToken();
    expect(result).toEqual({ apiKey: 'NEW_API_KEY', expiresAt: expiresAtSeconds * 1000 });

    const cached = getCachedCopilotToken();
    expect(cached).toEqual({ apiKey: 'NEW_API_KEY', expiresAt: expiresAtSeconds * 1000 });
  });

  it('Test case 2.2: refreshCopilotToken - OAuth token not found', async () => {
    getGithubCopilotOauthTokenMock.mockReturnValue(undefined);
    const result = await refreshCopilotToken();
    expect(result).toBeUndefined();
  });

  it('Test case 2.3: refreshCopilotToken - fetch fails (network error)', async () => {
    getGithubCopilotOauthTokenMock.mockReturnValue('DUMMY_OAUTH_TOKEN');
    fetch.mockRejectedValue(new Error('Network error'));

    const result = await refreshCopilotToken();
    expect(result).toBeUndefined();
    expect(getCachedCopilotToken()).toBeUndefined();
  });

  it('Test case 2.4: refreshCopilotToken - API returns error (e.g., 401)', async () => {
    getGithubCopilotOauthTokenMock.mockReturnValue('DUMMY_OAUTH_TOKEN');
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    const result = await refreshCopilotToken();
    expect(result).toBeUndefined();
    expect(getCachedCopilotToken()).toBeUndefined();
  });
  
  // Test cases 2.5 and 2.6 require manipulating the internal cache state.
  // This is tricky without a dedicated reset/setter in the module.
  // We can test the behavior by first successfully refreshing to set the cache,
  // then manipulating time (with vi.useFakeTimers) or by observing behavior post-refresh.

  describe('getCachedCopilotToken with cache state manipulation', () => {
    beforeEach(async () => {
      // Ensure cache is in a known state before these tests
      // Resetting by forcing a failed refresh (if no direct access to cache vars)
      getGithubCopilotOauthTokenMock.mockReturnValue(undefined); // Cause refresh to fail if called
      await refreshCopilotToken(); // This should clear the cache
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('Test case 2.5: getCachedCopilotToken - token expired', async () => {
      // Step 1: Successfully refresh to populate cache
      getGithubCopilotOauthTokenMock.mockReturnValue('DUMMY_OAUTH_TOKEN');
      const initialExpiresAtSeconds = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'OLD_KEY', expires_at: initialExpiresAtSeconds }),
      } as Response);
      await refreshCopilotToken();
      expect(getCachedCopilotToken()?.apiKey).toBe('OLD_KEY');

      // Step 2: Advance time to make the token expired
      vi.advanceTimersByTime(3601 * 1000); // Advance time by 1 hour and 1 second

      expect(getCachedCopilotToken()).toBeUndefined();
    });

    it('Test case 2.6: getCachedCopilotToken - token valid (respecting buffer)', async () => {
      // Step 1: Successfully refresh to populate cache
      getGithubCopilotOauthTokenMock.mockReturnValue('DUMMY_OAUTH_TOKEN');
      // Expires in 10 minutes
      const initialExpiresAtSeconds = Math.floor(Date.now() / 1000) + 10 * 60; 
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'VALID_KEY', expires_at: initialExpiresAtSeconds }),
      } as Response);
      await refreshCopilotToken();
      
      // Token should be valid (10 minutes > 5 minutes buffer)
      expect(getCachedCopilotToken()?.apiKey).toBe('VALID_KEY');

      // Step 2: Advance time so token is within the 5-minute buffer (e.g., 6 minutes passed, 4 mins left)
      vi.advanceTimersByTime(6 * 60 * 1000); 
      
      // Token should now be considered invalid due to buffer
      expect(getCachedCopilotToken()).toBeUndefined();
    });
  });
});
