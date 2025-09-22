import { URL } from 'url';

export function addTokenToGitUrl(url: string, token: string): string {
  if (url.startsWith('https://')) {
    return url.replace('https://', `https://oauth2:${token}@`);
  }
  if (url.startsWith('http://')) {
    return url.replace('http://', `http://oauth2:${token}@`);
  }
  return url;
}

export function stripCredentialsFromGitUrl(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }

  try {
    const urlObj = new URL(trimmed);
    urlObj.username = '';
    urlObj.password = '';
    return urlObj.toString();
  } catch {
    return undefined;
  }
}

export function extractOriginFromGitUrl(remoteUrl: string): string | undefined {
  try {
    const normalized = remoteUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      return undefined;
    }
    const urlObj = new URL(normalized);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    return undefined;
  }
}
