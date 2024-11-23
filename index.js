let ws = null;
const ws_address = "ws://" + window.location.hostname + ":8080"
let retryInterval = 100;
let synced = false;

let palette = [];
let buttons = 0;

let hsv = {h:0, s:0, v:0};

const PACKET_RGB = 0x01;
const PACKET_SYNC_RGB = 0x02;
const PACKET_SYNC_BUTTONS = 0x03;
const PALETTE_LEN = 4;

function HSVtoRGB(hsv) {
    h = hsv.h; s = hsv.s; v = hsv.v;
    h *= .36; // normalize from 0-1000 range of the sliders
    s *= .001;
    v *= .001;
    let f= (n,k=(n+h/60)%6) => v - v*s*Math.max( Math.min(k,4-k,1), 0);
    let rgb = {
        r: f(5) * 255,
        g: f(3) * 255,
        b: f(1) * 255,
    };
    return rgb;
}
function RGBtoHSV(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const v = max * 1000; // Scale up to match HSV range in your sliders
    const s = max === 0 ? 0 : (delta / max) * 1000; // Scale up to match slider range
    let h;
    if (delta === 0) { h = 0;
    } else if (max === r) {
        h = (60 * ((g - b) / delta) + 360) % 360;
    } else if (max === g) {
        h = 60 * ((b - r) / delta + 2);
    } else {
        h = 60 * ((r - g) / delta + 4);
    }
    h = h / 0.36; // Normalize to 0-1000 range of sliders
    return { h, s, v };
}

document.getElementById('slider_h').oninput = sendHSVUpdate;
document.getElementById('slider_s').oninput = sendHSVUpdate;
document.getElementById('slider_v').oninput = sendHSVUpdate;


function syncPalette() {
    for (let i = 0; i < PALETTE_LEN; i++) {
        document.getElementById("btn"+(i+1)).style.background = "rgb("+ palette[i].r + "," + palette[i].g + "," + palette[i].b + ")";
    }
}
function setButtonClass(element, classname, set) {
    element.classList.remove("depressed");
    if (set) element.classList.add(classname);
    else element.classList.remove(classname);
    
}
function syncButtons() {
    console.log(buttons);
    setButtonClass(document.getElementById('powerbtn'), "pressed", buttons & 1);
    setButtonClass(document.getElementById('fadebtn'), "pressed", buttons & 2);
    setButtonClass(document.getElementById('circadianbtn'), "pressed", buttons & 3);
    setButtonClass(document.getElementById('savebtn'), "pressed", false);
}

function syncSliders() {
    let sh,ss,sv;
    sh = document.getElementById('slider_h');
    ss = document.getElementById('slider_s');
    sv = document.getElementById('slider_v');
    sh.value = hsv.h;
    ss.value = hsv.s;
    sv.value = hsv.v;
    let rgb2 = HSVtoRGB({h:hsv.h,s:1000,v:1000});
    ss.style.backgroundImage = "linear-gradient(90deg, gray, rgb(" + rgb2.r + "," + rgb2.g + "," + rgb2.b + "))";
    sv.style.backgroundImage = "linear-gradient(90deg, black, rgb(" + rgb2.r + "," + rgb2.g + "," + rgb2.b + "))";
}

function connectWebSocket() {
    console.log("Attempting to connect to WebSocket");
    ws = new WebSocket(ws_address);
//    ws.binaryType = "arraybuffer";
    ws.onmessage = async (event) => {
        try {
            const data = new Uint8Array(await event.data.arrayBuffer());
            switch(data[0]) {
                case PACKET_SYNC_RGB:
                    if (data.length != 4) {
                        console.error("Invalid packet when syncing");
                        break;
                    }
                    r = data[1];
                    g = data[2];
                    b = data[3];
                    hsv = RGBtoHSV(r,g,b);

                    console.log("Sync RGB:", r,g,b);
                    syncSliders();
                    break;

                case PACKET_SYNC_BUTTONS:
                    const length = data[1]+1;
                    buttons = data[2];

                    let j = 0;
                    for (let i = 3; i < length*3; i+=3) {
                        palette[j] = {r:data[i], g:data[i+1], b:data[i+2]};
                        j++;
                    }
                    syncPalette();
                    syncButtons();
                    break;
            }
        } catch (err) {
            console.error(err);
        }
        synced = true;
    };
    ws.onopen = (event) => {
        console.log("Connected");
        retryInterval = 100;
        document.getElementById('feedback').classList.add("hidden");
        document.getElementById('spinner').classList.add("hidden");

        ws.send( new Uint8Array([PACKET_SYNC_RGB]) );
        ws.send( new Uint8Array([PACKET_SYNC_BUTTONS]) );
    };
    ws.onclose = (event) => {
        console.log("Connection lost, retrying in a bit");
        document.getElementById('spinner').classList.remove("hidden");
        document.getElementById('feedback').classList.remove("hidden");
        setTimeout(connectWebSocket,retryInterval);
        retryInterval = Math.min(retryInterval+200, 5000);
    };
}
connectWebSocket();

function sendHSVUpdate() {
    if (!synced) return;

    let sh,ss,sv;
    sh = document.getElementById('slider_h');
    ss = document.getElementById('slider_s');
    sv = document.getElementById('slider_v');
    let h = parseInt(sh.value);
    let s = parseInt(ss.value);
    let v = parseInt(sv.value);
    hsv = {h,s,v};
    syncSliders();

    let rgb = HSVtoRGB(hsv);

    let rgbBytes = new Uint8Array([PACKET_RGB, rgb.r, rgb.g, rgb.b]);
    if (ws.readyState === ws.OPEN)
        ws.send(rgbBytes);
}

// obsolete
function sendRGBUpdate() {
    let red = parseInt(document.getElementById('slider_r').value);
    let green = parseInt(document.getElementById('slider_g').value);
    let blue = parseInt(document.getElementById('slider_b').value);

    let rgbBytes = new Uint8Array([PACKET_RGB, red, green, blue]);
    if (ws.readyState === ws.OPEN)
        ws.send(rgbBytes);
}

