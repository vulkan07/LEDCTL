let ws = null;
const ws_address = "ws://" + window.location.hostname + ":8080"
let retryInterval = 100;
let synced = false;

const PALETTE_LEN = 9;
let palette = [];
let buttons = 0;
const POWER_BTN = 1;

let hsv = {h:0, s:0, v:0};

const PACKET_SEND_MASK = 128;
const PACKET_COLOR = 1;
const PACKET_BUTTONS = 2;
const PACKET_PALETTE = 3;

function HSVtoRGB(hsv) {
    h = hsv.h; s = hsv.s; v = hsv.v;
    h *= .025; // normalize from 0-1000 range of the sliders .36, .001
    s *= .025;
    v *= .025;
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
                case PACKET_COLOR:
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

                case PACKET_PALETTE:
                    const length = data[1]+1;
                    buttons = data[2];

                    let j = 0;
                    for (let i = 2; i < length*3; i+=3) {
                        palette[j] = {r:data[i], g:data[i+1], b:data[i+2]};
                        j++;
                    }
                    syncPalette();
                    console.log("Synced palette");
                    break;

                case PACKET_BUTTONS:
                    console.log("skipped :Synced buttons");
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

        ws.send( new Uint8Array([PACKET_COLOR]) );
        ws.send( new Uint8Array([PACKET_BUTTONS]) );
        ws.send( new Uint8Array([PACKET_PALETTE]) );
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

function powerButtonUpdate() {
    let btn = document.getElementById('powerbtn')
    buttons ^= POWER_BTN; //Flip state
    if (buttons & POWER_BTN)
        btn.classList.add("pressed");
    else
        btn.classList.remove("pressed");
    
    let packet = new Uint8Array([PACKET_BUTTONS | PACKET_SEND_MASK, buttons]);
}


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

    let rgbBytes = new Uint8Array([PACKET_COLOR | PACKET_SEND_MASK, rgb.r, rgb.g, rgb.b]);
    if (ws.readyState === ws.OPEN)
        ws.send(rgbBytes);
}
