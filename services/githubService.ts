import { GitHubRepo } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

export const validateToken = async (token: string): Promise<string | null> => {
  try {
    const res = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.login; // Return username
  } catch (e) {
    return null;
  }
};

export const getUserRepos = async (token: string): Promise<GitHubRepo[]> => {
  let repos: GitHubRepo[] = [];
  let page = 1;
  // Fetch up to 3 pages (300 repos) to be safe, or until empty
  while (true) {
    const res = await fetch(`${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    
    if (!res.ok) throw new Error('Failed to fetch repositories');
    const data = await res.json();
    if (data.length === 0) break;
    repos = [...repos, ...data];
    page++;
    if (page > 3) break; // Safety break
  }
  return repos;
};

export const getRepoFolders = async (
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> => {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch repository folders');

  const data = await res.json();
  const tree = Array.isArray(data.tree) ? data.tree : [];

  const folders = tree
    .filter((item: { type?: string; path?: string }) => item.type === 'tree' && item.path)
    .map((item: { path: string }) => item.path)
    .sort((a: string, b: string) => a.localeCompare(b));

  return folders;
};

export const checkFileExistsInRepo = async (
  token: string,
  owner: string,
  repo: string,
  path: string,
  filename: string
): Promise<boolean> => {
  const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '');
  const cleanPath = normalizedPath ? `${normalizedPath}/` : '';
  const fullPath = `${cleanPath}${filename}`;
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${fullPath}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (res.status === 404) return false;
  if (res.ok) return true;

  const err = await res.json();
  throw new Error(err.message || 'Failed to check existing file');
};

export const saveFileToRepo = async (
  token: string,
  owner: string,
  repo: string,
  path: string, // e.g. "notes/" or ""
  filename: string,
  content: string
): Promise<string> => {
  
  // Normalize folder path: remove leading/trailing slashes.
  const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '');
  const cleanPath = normalizedPath ? `${normalizedPath}/` : '';
  const fullPath = `${cleanPath}${filename}`;
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${fullPath}`;
  
  // 1. Check if file exists to get SHA (for update)
  let sha: string | undefined;
  try {
    const checkRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      sha = checkData.sha;
    }
  } catch (e) {
    // Ignore, likely doesn't exist
  }

  // 2. Create or Update
  const body = {
    message: `Add summary for ${filename} via BookDistill`,
    content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
    sha: sha, // Include SHA if updating
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to save file to GitHub');
  }

  const data = await res.json();
  return data.content.html_url;
};
