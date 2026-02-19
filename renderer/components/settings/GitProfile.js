import React, { useState, useEffect } from 'react';
import { User, Mail, Github } from 'lucide-react';

function GitProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.electron.invoke('git:get-profile');
        if (result?.success) setProfile(result);
      } catch (err) {
        console.error('[Settings] Failed to load git data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="git-page-loading">Loading profile...</div>;
  if (!profile) return <div className="git-page-loading">Git profile unavailable</div>;

  const initials = (profile.name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="git-page">
      <div className="git-page-header">
        {profile.avatarUrl ? (
          <img className="git-page-avatar" src={profile.avatarUrl} alt="" />
        ) : (
          <div className="git-page-avatar-fallback">
            {initials !== '?' ? initials : <User size={32} />}
          </div>
        )}
        <div className="git-page-identity">
          <h2 className="git-page-name">{profile.name || 'Not configured'}</h2>
          {profile.ghUser && (
            <span className="git-page-handle">@{profile.ghUser}</span>
          )}
        </div>
      </div>

      <div className="git-page-details">
        {profile.email && (
          <div className="git-detail-chip">
            <Mail size={13} />
            <span>{profile.email}</span>
          </div>
        )}
        {profile.ghUser && (
          <div className="git-detail-chip">
            <Github size={13} />
            <span>github.com/{profile.ghUser}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default GitProfile;
