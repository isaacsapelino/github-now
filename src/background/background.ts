import { isUndefined } from "util";
import * as moment from "moment";

interface PlayingInfo {
    src: 'YTMusic' | 'SoundCloud' | 'Spotify';
    name: string;
    artists: string;
    album?: string;
    year?: string;
    url?: string;
    albumCoverImage: string;
    updatedAt: Date;
}

chrome.alarms.create('refresh', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(a => {
    if (a.name !== 'refresh') return;
    report();
});

chrome.browserAction.onClicked.addListener(tab => {
    report();
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.data === "manualReport") {
        report();
    }
});

const report = () => {
    chrome.tabs.query({audible: true}, tabs => {
        var updated = false;
        const tryupdate = (info: PlayingInfo) => {
            if (updated) {
                return;
            }

            chrome.storage.sync.get(['last'], res => {
                const last = res.last as PlayingInfo;
                if (isUndefined(last)) {
                    return;
                }
                if (last.src === info.src && last.name === info.name && last.artists === info.artists) {
                    return;
                }
            });

            chrome.storage.sync.set({ 'last': info });
            update(info);
            updated = true;
        }
        tabs.forEach(t => {
            if (t.audible && t.url.startsWith('https://soundcloud.com/')) {
                chrome.tabs.executeScript(t.id, {
                    code: "[document.querySelector('.playControls__soundBadge .playbackSoundBadge__titleLink').title, document.querySelector('.playControls__soundBadge .playbackSoundBadge__lightLink').title, document.querySelector('.playControls__soundBadge .playbackSoundBadge__titleLink').href, document.querySelector('.playControls__soundBadge span.sc-artwork').style.backgroundImage]"
                }, results => {
                    const res = results[0] as string[];
                    const [name, artists, url, albumCoverImg] = res;
                    const albumCoverImgSrc = new RegExp('url\\(\\"(.*)\\"\\)').exec(albumCoverImg)[1];
                    tryupdate({
                        src: 'SoundCloud',
                        name,
                        artists,
                        url,
                        albumCoverImage: albumCoverImgSrc,
                        updatedAt: new Date(),
                    });
                });
            }
            if (t.audible && t.url.startsWith('https://music.youtube.com/')) {
                chrome.tabs.executeScript(t.id, {
                    code: "[document.querySelector('yt-formatted-string.ytmusic-player-bar.title').innerText, document.querySelector('yt-formatted-string.ytmusic-player-bar.byline').title, document.querySelector('img.ytmusic-player-bar').src, document.querySelector('.ytmusic-player-bar .yt-simple-endpoint').href]"
                }, results => {
                    const res = results[0] as string[];
                    const name = res[0];
                    const infos = res[1].split(" • ");
                    const [artists, album, year] = infos;
                    const albumCoverImgSrc = res[2];
                    const albumCoverImgOriginal = new RegExp('(.*)=.*').exec(albumCoverImgSrc)[1];
                    const url = res[3];
                    tryupdate({
                        src: 'YTMusic',
                        name,
                        artists,
                        album,
                        year,
                        url,
                        albumCoverImage: albumCoverImgOriginal,
                        updatedAt: new Date(),
                    });
                });
            }
            if (t.audible && t.url.startsWith('https://open.spotify.com/')) {
                chrome.tabs.executeScript(t.id, {
                    /* 
                     * Spotify web player doesn't give album and year information
                     * TrackName
                     * Artists
                     * Cover Image URL (currently there are several images in different resolutions, workaround needed)
                     * Track Album Link
                     */
                    code: `[
                        document.querySelector('a[data-testid="nowplaying-track-link"]').innerText,
                        document.querySelector('div[class="_44843c8513baccb36b3fa171573a128f-scss ellipsis-one-line"]').innerText,
                        document.querySelectorAll('img[class="_31deeacc1d30b0519bfefa0e970ef31d-scss cover-art-image"]')[0].src,
                        document.querySelector('a[data-testid="nowplaying-track-link"]').href
                    ]`
                }, results => {
                    const res = results[0] as string[];
                    const name = res[0];
                    const artists = res[1];
                    const albumCoverImage = res[2];
                    const url = res[3];
                    tryupdate({
                        src: 'Spotify',
                        name,
                        artists,
                        url,
                        albumCoverImage,
                        updatedAt: new Date(),
                    });
                });
            }
        });
    });
}

const update = (info: PlayingInfo) => {
    const id = "";
    const oauth = "";
    const message = "auto update by github-now";

    const auth = `token ${oauth}`;
    fetch(`https://api.github.com/repos/${id}/${id}/contents/README.template.md`, {
        headers: {
            "Authorization": auth
        },
    }).then(async resp => {
        const json = await resp.json();
        const template = decodeURIComponent(escape(atob(json.content)));
        // looks like need a template engine..
        const content = template
        .replace("{CURRENT_PLAYING_SOURCE}", info.src)
        .replace("{CURRENT_PLAYING_NAME}", info.name)
        .replace("{CURRENT_PLAYING_ARTISTS}", info.artists)
        .replace("{CURRENT_PLAYING_ALBUM}", info.album)
        .replace("{CURRENT_PLAYING_RELEASED}", info.year)
        .replace("{CURRENT_PLAYING_ALBUM_SRC}", info.albumCoverImage)
        .replace("{CURRENT_PLAYING_URL}", info.url)
        .replace("{CURRENT_PLAYING_LAST_UPDATED}", moment(info.updatedAt).format('MM/DD/YYYY HH:mm'));
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const target = await fetch(`https://api.github.com/repos/${id}/${id}/contents/README.md`);
        const sha = (await target.json()).sha;
        try {
            const postResp = await fetch(`https://api.github.com/repos/${id}/${id}/contents/README.md`, {
                method: "PUT",
                headers: {
                    "Authorization": auth
                },
                body: JSON.stringify({
                    "message": message,
                    "content": encoded,
                    "sha": sha,
                    "committer": {
                        "name": "github-now",
                        "email": "2+github-now@0chan.dev",
                    },
                }),
            });

            if (postResp.ok) {
                console.log("updated");
            }
        } catch (postResp) {
            console.log(`Error ${postResp}`);
        }
    })
}