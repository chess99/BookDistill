import React, { useState, useEffect } from 'react';
import { Github, Loader2, CheckCircle, AlertCircle, Save } from './Icons';
import { validateToken, getUserRepos, getRepoFolders, saveFileToRepo } from '../services/githubService';
import { GitHubRepo } from '../types';

const GH_TOKEN_KEY = 'gh_token';
const GH_LAST_REPO_KEY = 'gh_last_repo';
const GH_REPO_PATH_MEMORY_KEY = 'gh_repo_path_memory';

type RepoPathMemory = Record<
  string,
  {
    mode: 'existing' | 'new';
    existingPath: string;
    newPath: string;
  }
>;

const readRepoPathMemory = (): RepoPathMemory => {
  try {
    const raw = localStorage.getItem(GH_REPO_PATH_MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const writeRepoPathMemory = (repo: string, value: RepoPathMemory[string]) => {
  if (!repo) return;
  const current = readRepoPathMemory();
  current[repo] = value;
  localStorage.setItem(GH_REPO_PATH_MEMORY_KEY, JSON.stringify(current));
};

interface GitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentToSave: string;
  defaultFilename: string;
}

const GitHubModal: React.FC<GitHubModalProps> = ({ isOpen, onClose, contentToSave, defaultFilename }) => {
  const [token, setToken] = useState(localStorage.getItem(GH_TOKEN_KEY) || '');
  const [username, setUsername] = useState<string | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>(localStorage.getItem(GH_LAST_REPO_KEY) || '');
  const [repoFolders, setRepoFolders] = useState<string[]>([]);
  const [pathMode, setPathMode] = useState<'existing' | 'new'>('existing');
  const [selectedFolderPath, setSelectedFolderPath] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [filename, setFilename] = useState(defaultFilename);
  
  const [loading, setLoading] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSuccessUrl(null);
      setError(null);
      setFilename(defaultFilename);
      if (token && !username) {
        handleValidateToken();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultFilename]);

  const handleValidateToken = async () => {
    setLoading(true);
    setError(null);
    const user = await validateToken(token);
    if (user) {
      setUsername(user);
      localStorage.setItem(GH_TOKEN_KEY, token);
      fetchRepos(token);
    } else {
      setError("Invalid Personal Access Token.");
      setUsername(null);
      setLoading(false);
    }
  };

  const fetchRepos = async (validToken: string) => {
    try {
      const r = await getUserRepos(validToken);
      setRepos(r);
      if (r.length > 0) {
        const rememberedRepo = localStorage.getItem(GH_LAST_REPO_KEY);
        const initialRepo = rememberedRepo && r.some((repo) => repo.full_name === rememberedRepo)
          ? rememberedRepo
          : r[0].full_name;
        setSelectedRepo(initialRepo);
        localStorage.setItem(GH_LAST_REPO_KEY, initialRepo);
        fetchFolders(validToken, initialRepo, r);
      }
    } catch (e) {
      setError("Failed to load repositories.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async (validToken: string, repoFullName: string, repoList: GitHubRepo[] = repos) => {
    const selected = repoList.find((r) => r.full_name === repoFullName);
    if (!selected) {
      setRepoFolders([]);
      setSelectedFolderPath('');
      return;
    }

    const [owner, repoName] = selected.full_name.split('/');
    setLoadingFolders(true);
    setError(null);
    try {
      const folders = await getRepoFolders(validToken, owner, repoName, selected.default_branch);
      const remembered = readRepoPathMemory()[repoFullName];
      const rememberedExistingPath = remembered?.existingPath || '';
      setRepoFolders(folders);
      setPathMode(remembered?.mode || 'existing');
      setNewFolderPath(remembered?.newPath || '');
      setSelectedFolderPath(
        rememberedExistingPath && folders.includes(rememberedExistingPath) ? rememberedExistingPath : ''
      );
    } catch (e) {
      setRepoFolders([]);
      setSelectedFolderPath('');
      setError('Failed to load repository folders.');
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleSave = async () => {
    if (!selectedRepo || !filename) return;
    const finalPath = pathMode === 'new' ? newFolderPath.trim() : selectedFolderPath.trim();
    
    setLoading(true);
    setError(null);
    try {
      const [owner, repoName] = selectedRepo.split('/');
      const htmlUrl = await saveFileToRepo(token, owner, repoName, finalPath, filename.trim(), contentToSave);
      setSuccessUrl(htmlUrl);
    } catch (e: any) {
      setError(e.message || "Failed to save.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedRepo) return;
    writeRepoPathMemory(selectedRepo, {
      mode: pathMode,
      existingPath: selectedFolderPath.trim(),
      newPath: newFolderPath.trim()
    });
  }, [selectedRepo, pathMode, selectedFolderPath, newFolderPath]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Github className="w-6 h-6" />
            Save to GitHub
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6">
          {successUrl ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <p className="text-lg font-medium text-slate-800">Successfully Saved!</p>
              <a 
                href={successUrl} 
                target="_blank" 
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                View on GitHub
              </a>
              <button 
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Step 1: Auth */}
              <div className={`space-y-2 ${username ? 'opacity-50 pointer-events-none' : ''}`}>
                <label className="block text-sm font-medium text-slate-700">
                  Personal Access Token (Classic or Fine-grained)
                </label>
                <div className="flex gap-2">
                  <input 
                    type="password" 
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_..."
                    className="flex-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white text-slate-900"
                  />
                  <button 
                    onClick={handleValidateToken}
                    disabled={loading || !token}
                    className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50"
                  >
                    {loading && !username ? <Loader2 className="animate-spin w-5 h-5"/> : 'Connect'}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Token needs <code>repo</code> scope. The token is stored locally in your browser.
                </p>
              </div>

              {/* Step 2: Config */}
              {username && (
                <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded-md">
                    <CheckCircle className="w-4 h-4" />
                    Connected as <strong>{username}</strong>
                    <button 
                      onClick={() => {
                        setUsername(null);
                        setRepos([]);
                        setRepoFolders([]);
                        setSelectedRepo('');
                        setSelectedFolderPath('');
                        setNewFolderPath('');
                      }} 
                      className="text-xs underline ml-auto text-slate-500 hover:text-red-500 pointer-events-auto"
                    >
                      Disconnect
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Repository</label>
                    <select 
                      value={selectedRepo} 
                      onChange={(e) => {
                        const nextRepo = e.target.value;
                        setSelectedRepo(nextRepo);
                        localStorage.setItem(GH_LAST_REPO_KEY, nextRepo);
                        fetchFolders(token, nextRepo);
                      }}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                    >
                      {repos.map(r => (
                        <option key={r.id} value={r.full_name}>{r.full_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Folder Path (Optional)</label>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setPathMode('existing')}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                              pathMode === 'existing'
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            Select Existing
                          </button>
                          <button
                            type="button"
                            onClick={() => setPathMode('new')}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                              pathMode === 'new'
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            Create New
                          </button>
                        </div>

                        {pathMode === 'existing' ? (
                          <select
                            value={selectedFolderPath}
                            onChange={(e) => setSelectedFolderPath(e.target.value)}
                            disabled={loadingFolders}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900 disabled:opacity-60"
                          >
                            <option value="">(Repository root)</option>
                            {repoFolders.map((folder) => (
                              <option key={folder} value={folder}>
                                {folder}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={newFolderPath}
                            onChange={(e) => setNewFolderPath(e.target.value)}
                            placeholder="notes/books"
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                          />
                        )}

                        {loadingFolders && <p className="text-xs text-slate-500">Loading folders...</p>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Filename</label>
                    <input 
                      type="text" 
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      placeholder="summary.md"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                    />
                  </div>

                  <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full mt-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all"
                  >
                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <><Save className="w-5 h-5" /> Commit to GitHub</>}
                  </button>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GitHubModal;