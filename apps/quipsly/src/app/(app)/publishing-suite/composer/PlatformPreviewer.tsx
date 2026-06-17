"use client";

import React from "react";

interface PlatformPreviewerProps {
  platform: string; // "global", "youtube_v3", "podcast_rss", "patreon_v2", "x_twitter"
  content: string;
  mediaUrls?: string[];
}

export function PlatformPreviewer({ platform, content, mediaUrls }: PlatformPreviewerProps) {
  // Simple mockups of social platform native UI
  const avatar = "https://ui-avatars.com/api/?name=Quipsly&background=random";

  if (platform === "x_twitter") {
    return (
      <div className="border border-gray-800 rounded-xl p-4 bg-black text-white max-w-md w-full">
        <div className="flex items-center space-x-3 mb-2">
          <img src={avatar} alt="Avatar" className="w-10 h-10 rounded-full" />
          <div>
            <div className="font-bold text-sm">Quipsly Creator</div>
            <div className="text-gray-500 text-sm">@quipslycreator</div>
          </div>
        </div>
        <div className="text-sm whitespace-pre-wrap mb-3">{content}</div>
        {mediaUrls && mediaUrls.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-gray-800">
            <img src={mediaUrls[0]} alt="Attached Media" className="w-full object-cover" />
          </div>
        )}
      </div>
    );
  }

  if (platform === "youtube_v3") {
    return (
      <div className="border border-gray-300 rounded-lg p-3 bg-white text-black max-w-md w-full">
        <div className="aspect-video bg-gray-200 mb-3 relative rounded overflow-hidden flex items-center justify-center text-gray-500">
          {mediaUrls && mediaUrls.length > 0 ? (
            <img src={mediaUrls[0]} alt="Video Thumbnail" className="w-full h-full object-cover" />
          ) : (
            <span>Video Thumbnail</span>
          )}
        </div>
        <div className="flex space-x-3">
          <img src={avatar} alt="Avatar" className="w-9 h-9 rounded-full mt-1" />
          <div>
            <div className="font-bold text-sm line-clamp-2 leading-tight mb-1">
              {content.split("\n")[0] || "Video Title"}
            </div>
            <div className="text-gray-500 text-xs">Quipsly Creator • 0 views • Just now</div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback / Global Preview
  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white text-black shadow-sm max-w-md w-full">
      <div className="flex items-center space-x-3 mb-4">
        <img src={avatar} alt="Avatar" className="w-10 h-10 rounded-full" />
        <div>
          <div className="font-semibold text-sm">Preview</div>
          <div className="text-gray-500 text-xs">{platform}</div>
        </div>
      </div>
      <div className="text-sm whitespace-pre-wrap text-gray-700">{content}</div>
      {mediaUrls && mediaUrls.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {mediaUrls.map((url, i) => (
            <img key={i} src={url} alt="Media" className="rounded-lg object-cover aspect-square w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
