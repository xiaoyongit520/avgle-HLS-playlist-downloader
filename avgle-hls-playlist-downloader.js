// ==UserScript==
// @name         avgle HLS playlist downloader
// @namespace    https://avgle.com/
// @version      0.2.2
// @description  decrypts and downloads avgle HLS playlist in browser
// @author       avotoko by edit ken
// @match        https://avgle.com/*
// ==/UserScript==

(function () {
    "use strict";
    let d = document, ver = "v.0.2.2";

    function info(msg) {
        let e = d.querySelector('div.ahpd-info');
        e && (e.textContent = msg);
    }

    function log() {
        console.log.apply(console, ["[avgleHPD]"].concat(Array.from(arguments)));
    }

    function loginfo() {
        log.apply(console, arguments);
        info.apply(console, arguments);
    }

    function appendStylesheet(rules, id) {
        let e = d.createElement("style");
        if (id)
            e.id = id;
        e.type = "text/css";
        e.innerHTML = rules;
        d.getElementsByTagName("head")[0].appendChild(e);
    }

    function downloadPlaylist(playlist, filename) {
        if (typeof avglehpdPreDownload === "function") {
            let r = avglehpdPreDownload({playlist});
            filename = (r && r.filename) || filename;
        }
        let a = d.querySelector('.ahpd-download');
        a.classList.remove("ahpd-hide");
        a.addEventListener('click', function (e) {
            callApiDownload(playlist, filename).then(r => {
                if (r.code === 200) {
                    alert('add task success!')
                }
                console.log(r)
            }).catch(e => {
                console.log(e)
            })
        })
        // a.href = URL.createObjectURL(new Blob([playlist], { type: "application/x-mpegURL" }));
        // a.setAttribute("download", filename);


    }

    function callApiDownload(playlist, filename) {
        let requestInstance = new Request('http://127.0.0.1:3800/', {
            method: 'post',
            mode: 'cors',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json;charset=utf-8'
            },
            body: JSON.stringify({m3u8: playlist, fileName: filename})
        });
        return fetch(requestInstance);
    }

    function isSegmentUriEncrypted(playlist) {
        let a = playlist.split('\n');
        for (let i = 0; i < a.length; i++) {
            if (/^\s*$/.test(a[i]))
                continue;
            if (a[i].charAt(0) === "#") {
                let tag = a[i];
                if (/^#EXT-X-ENDLIST/.test(tag))
                    break;
                continue;
            }
            let uri = a[i];
            if (uri.includes('!'))
                return true;
        }
        return false;
    }

    function decryptPlaylist(playlist, options) {
        let a = playlist.split('\n');
        for (let i = 0; i < a.length; i++) {
            if (/^\s*$/.test(a[i]))
                continue;
            if (a[i].charAt(0) === "#") {
                let tag = a[i];
                if (/^#EXT-X-ENDLIST/.test(tag))
                    break;
                continue;
            }
            let uri = a[i];
            if (uri.includes("!")) {
                options.uri = uri;
                options.decryptURI();
                if (!/^https:\/\//.test(options.uri)) {
                    log("can't decript uri:", uri);
                    throw Error("can't decrypt uri");
                }
                a[i] = options.uri;
            }
        }
        return a.join('\n');
    }

    function main() {
        if (!videojs) {
            throw new Error("videojs not defined");
        }
        window.md5 = new Proxy(window.md5, {
            apply: function (target, thisArg, argumentsList) {
                if (/(^avgle\.com\/|\/avgle-hls-playlist-downloader\.js$)/.test(argumentsList[0])) {
                    argumentsList[0] = "avgle.com/templates/frontend/videojs-contrib-hls.js";
                }
                return Reflect.apply(target, thisArg, argumentsList);
            }
        });

        function clipboardWrite(value) {
            window.navigator.clipboard.writeText(value)
                .then(() => {
                    console.log('Text copied to clipboard');
                })
                .catch(err => {
                    // This can happen if the user denies clipboard permissions:
                    console.error('Could not copy text: ', err);
                });
        };

        function getVideoTitle() {
            let title = 'avgle';
            title = decodeURI(window.location.pathname);
            title = title.replace('/video/', '');
            title = title.replaceAll('/', '-');
            title = title.replace(/\s*/g, '');
            log(title);
            return title;

        };
        log(getVideoTitle());
        let prevBeforeRequest = videojs.Hls.xhr.beforeRequest;

        function restoreBeforeRequest() {
            videojs.Hls.xhr.beforeRequest = prevBeforeRequest;
            log("restored videojs.Hls.xhr.beforeRequest");
        }

        videojs.Hls.xhr.beforeRequest = function (options) {
            log("beforeRequest:", options.uri);
            if (/\/(video)?playback/.test(options.uri)) {
                log("got target request:", options.uri);
                setTimeout(function () {
                    log("hooking request callback");
                    info("wating http response");
                    let prevCallback = options.callback;
                    options.callback = function (error, request) {
                        loginfo("got response");

                        if (request.rawRequest.response.includes('#EXTM3U')) {
                            let playlist = request.rawRequest.response;
                            loginfo("got hls playlist");
                            let title = getVideoTitle();
                            clipboardWrite(title);
                            if (isSegmentUriEncrypted(playlist)) {
                                loginfo("segment uri is encrypted");
                                let newOptions = videojs.Hls.xhr.beforeRequest({uri: "!dummy"});
                                if (typeof newOptions.decryptURI !== "function")
                                    throw new Error("can't retrieve decryptURI function");
                                log("decryptURI:\n", newOptions.decryptURI.toString());
                                loginfo("decrypting uri in playlist");
                                playlist = decryptPlaylist(playlist, newOptions);
                                log("decrypted playlist:\n" + playlist);
                                info("decrypted playlist successfully");
                                downloadPlaylist(playlist, `${title}.m3u8`);
                            } else {
                                log("segment uri is not encrypted");
                                downloadPlaylist(playlist, `${title}.m3u8`);
                            }
                        } else {
                            loginfo("error: can't decrypt response!");
                            log("avgle-main-ah.js must already decrypt the response if the response is encrypted");
                        }
                        if (prevCallback)
                            prevCallback(error, request);
                    };
                }, 0);
                setTimeout(restoreBeforeRequest, 0);
            }
            return prevBeforeRequest(options);
        };
        log("hooked videojs.Hls.xhr.beforeRequest and waiting hls xhr request");
        info("Please click the close button.");
        d.querySelector("#player_3x2_container").addEventListener("click", () => {
            info("waiting hls xhr request");
            log("the close button clicked");
        });
        log("waiting for the close button to be clicked");
    }

    try {
        if (d.querySelector(".ahpd-area")) {
            alert("avgleHPD already executed");
            return;
        }
        log("avgle HLS playlist downloader " + ver);
        console.clear = function () {
        };
        {
            let s, e, sel = "div.container > div.row";
            if (!(e = d.querySelector(sel))) {
                log("element '" + sel + "' not found");
                alert("avgleHPD error: " + "element '" + sel + "' not found");
                return;
            }
            appendStylesheet(".ahpd-area{display:flex; font-size:large; }.ahpd-ver{margin-right:5px; background-color:gold; font-weight:bold; text-align:center; vertical-align:middle; border:1px solid transparent; padding:8px 12px; width:min-content; white-space:nowrap; border-radius:4px; }.ahpd-info{margin-right:5px; background-color:beige; text-align:center; border:1px solid transparent; padding:8px 12px; width:min-content; white-space:nowrap; font-size:large; border-radius:4px; }.ahpd-download{font-weight:bold; padding:8px 12px; }.ahpd-download:hover{border:1px outset transparent; } .ahpd-hide{display:none;}");
            let area = e.insertBefore(d.createElement("div"), e.firstElementChild);
            area.className = "ahpd-area";
            e = area.appendChild(d.createElement("div"));
            e.className = "ahpd-ver";
            e.textContent = "avgleHPD " + ver;
            e = area.appendChild(d.createElement("div"));
            e.className = "ahpd-info";
            e.textContent = "avgleHPD information here";
            e = area.appendChild(d.createElement("a"));
            e.className = "btn-primary ahpd-download ahpd-hide";
            e.textContent = "Download HLS Playlist";
        }
        main();
    } catch (e) {
        loginfo("error: " + e.message);
    }
})();
