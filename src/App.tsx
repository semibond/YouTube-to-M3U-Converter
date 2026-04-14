import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Copy, Download, Plus, Trash2, Youtube, Code } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Channel {
  id: string;
  name: string;
  url: string;
  group: string;
  logo: string;
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(() => {
    const saved = localStorage.getItem("yt-m3u-channels");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [group, setGroup] = useState("YouTube");
  const [logo, setLogo] = useState("");
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);
  
  const [bulkInput, setBulkInput] = useState("");
  const [exportMode, setExportMode] = useState("proxy-mp4");

  useEffect(() => {
    localStorage.setItem("yt-m3u-channels", JSON.stringify(channels));
  }, [channels]);

  // Auto-fetch title when URL changes
  useEffect(() => {
    const fetchTitle = async () => {
      if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) return;
      
      setIsLoadingTitle(true);
      try {
        const res = await fetch(`/api/youtube-title?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.title && !name) {
            setName(data.title);
          }
        }
      } catch (error) {
        console.error("Failed to fetch title:", error);
      } finally {
        setIsLoadingTitle(false);
      }
    };

    const timeoutId = setTimeout(fetchTitle, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [url]);

  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) return;

    const newChannel: Channel = {
      id: uuidv4(),
      name,
      url,
      group,
      logo,
    };

    setChannels([...channels, newChannel]);
    setName("");
    setUrl("");
    setLogo("");
  };

  const handleBulkAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim()) return;

    const newChannels: Channel[] = [];
    
    // Create a temporary DOM element to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(bulkInput, "text/html");
    
    // Find all links that might be YouTube URLs
    const links = doc.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
    
    if (links.length > 0) {
      links.forEach((a) => {
        const url = (a as HTMLAnchorElement).href;
        let name = a.textContent?.trim() || "";
        let logo = "";
        
        // Try to find an image in the same container (like the user's snippet)
        const container = a.closest('.result-item') || a.parentElement;
        if (container) {
          const img = container.querySelector('img');
          if (img) {
            logo = img.src;
          }
        }
        
        if (!name) name = "Imported Video";
        
        newChannels.push({
          id: uuidv4(),
          name,
          url,
          group: "YouTube",
          logo,
        });
      });
    } else {
      // Fallback: try to find plain URLs using regex
      const urlRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+)/g;
      const matches = bulkInput.match(urlRegex);
      
      if (matches) {
        // Remove duplicates
        const uniqueUrls = Array.from(new Set(matches));
        uniqueUrls.forEach((url) => {
          newChannels.push({
            id: uuidv4(),
            name: "Imported Video",
            url,
            group: "YouTube",
            logo: "",
          });
        });
      }
    }

    if (newChannels.length > 0) {
      setChannels([...channels, ...newChannels]);
      setBulkInput("");
      alert(`Successfully added ${newChannels.length} channels!`);
    } else {
      alert("No YouTube links found in the input.");
    }
  };

  const removeChannel = (id: string) => {
    setChannels(channels.filter((c) => c.id !== id));
  };

  const handleClearAll = () => {
    setChannels([]);
  };

  const extractVideoId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
    return match ? match[1] : null;
  };

  const generateM3U = () => {
    let m3u = "#EXTM3U\n";
    channels.forEach((channel) => {
      m3u += `#EXTINF:-1`;
      if (channel.logo) {
        m3u += ` tvg-logo="${channel.logo}"`;
      }
      if (channel.group) {
        m3u += ` group-title="${channel.group}"`;
      }
      m3u += `,${channel.name}\n`;

      if (exportMode === "proxy-mp4") {
        const videoId = extractVideoId(channel.url);
        if (videoId) {
          // Use a public Invidious instance to get the direct MP4 stream (itag 22 is 720p)
          // Appending #.mp4 tricks the IPTV player into thinking it's a raw video file
          m3u += `https://inv.tux.pizza/latest_version?id=${videoId}&itag=22#.mp4\n`;
        } else {
          m3u += `${channel.url}\n`;
        }
      } else if (exportMode === "proxy-hls") {
        const videoId = extractVideoId(channel.url);
        if (videoId) {
          // HLS variant is native for IPTV players, great for live streams and long videos
          m3u += `https://inv.tux.pizza/api/manifest/hls_variant/${videoId}#.m3u8\n`;
        } else {
          m3u += `${channel.url}\n`;
        }
      } else {
        m3u += `${channel.url}\n`;
      }
    });
    return m3u;
  };

  const handleDownload = () => {
    const m3u = generateM3U();
    const blob = new Blob([m3u], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "youtube-playlist.m3u";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    const m3u = generateM3U();
    navigator.clipboard.writeText(m3u);
    alert("Copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center justify-center gap-3">
            <Youtube className="w-8 h-8 text-red-600" />
            YouTube to M3U Converter
          </h1>
          <p className="mt-2 text-slate-600">
            Create an M3U playlist from YouTube links for SSIPTV and other players.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-5 space-y-6">
            <Tabs defaultValue="single" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single Link</TabsTrigger>
                <TabsTrigger value="bulk">Bulk / HTML Import</TabsTrigger>
              </TabsList>
              
              <TabsContent value="single">
                <Card>
                  <CardHeader>
                    <CardTitle>Add Channel</CardTitle>
                    <CardDescription>
                      Enter a single YouTube video or live stream URL.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddChannel} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="url">YouTube URL *</Label>
                        <Input
                          id="url"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2 relative">
                        <Label htmlFor="name">Channel / Video Name *</Label>
                        <div className="relative">
                          <Input
                            id="name"
                            placeholder="My Awesome Channel"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className={isLoadingTitle ? "pr-10" : ""}
                          />
                          {isLoadingTitle && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <div className="w-4 h-4 border-2 border-slate-300 border-t-red-600 rounded-full animate-spin" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="group">Group Title</Label>
                        <Input
                          id="group"
                          placeholder="News, Music, Sports..."
                          value={group}
                          onChange={(e) => setGroup(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="logo">Logo URL (Optional)</Label>
                        <Input
                          id="logo"
                          placeholder="https://example.com/logo.png"
                          value={logo}
                          onChange={(e) => setLogo(e.target.value)}
                        />
                      </div>
                      <Button type="submit" className="w-full">
                        <Plus className="w-4 h-4 mr-2" />
                        Add to Playlist
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="bulk">
                <Card>
                  <CardHeader>
                    <CardTitle>Bulk Import</CardTitle>
                    <CardDescription>
                      Paste HTML code or text containing YouTube links. We'll extract the titles, thumbnails, and URLs automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleBulkAdd} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="bulk">HTML or Text Input</Label>
                        <Textarea
                          id="bulk"
                          placeholder={`<div class="result-item">\n  <img src="...">\n  <a href="https://youtube.com/watch?v=...">Video Title</a>\n</div>`}
                          value={bulkInput}
                          onChange={(e) => setBulkInput(e.target.value)}
                          className="min-h-[250px] font-mono text-xs"
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full">
                        <Code className="w-4 h-4 mr-2" />
                        Parse & Add Links
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="md:col-span-7 space-y-6">
            <Card className="h-full flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle>Your Playlist</CardTitle>
                  <CardDescription>
                    {channels.length} {channels.length === 1 ? "channel" : "channels"} added
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={exportMode}
                    onChange={(e) => setExportMode(e.target.value)}
                  >
                    <option value="proxy-mp4">Direct MP4 (Best for Movies/VOD)</option>
                    <option value="proxy-hls">HLS .m3u8 (Best for Live Streams)</option>
                    <option value="standard">Standard YouTube Link (SSIPTV Only)</option>
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      disabled={channels.length === 0}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDownload}
                      disabled={channels.length === 0}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download .m3u
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleClearAll}
                      disabled={channels.length === 0}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {channels.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed rounded-lg">
                    <Youtube className="w-12 h-12 mb-2 opacity-20" />
                    <p>No channels added yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm group"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          {channel.logo ? (
                            <img
                              src={channel.logo}
                              alt={channel.name}
                              className="w-10 h-10 rounded object-cover bg-slate-100"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                              <Youtube className="w-5 h-5" />
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <h4 className="font-medium text-slate-900 truncate">
                              {channel.name}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                                {channel.group || "No Group"}
                              </span>
                              <span className="truncate max-w-[200px]">
                                {channel.url}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeChannel(channel.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
