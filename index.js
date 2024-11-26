let ws = null;
const ws_address = "ws://" + window.location.hostname + ":8080"
let retryInterval = 100;
let synced = false;

let color = {h:0, s:0, v:0, a:0};

const PALETTE_LEN = 9;
let palette = [];

const POWER_BTN = 1;
const DIM_BTN = 2;
let buttons = 0; // 8 bits each correspond to a button defined above


const PACKET_SEND_MASK = 128;
const PACKET_COLOR = 1;
const PACKET_BUTTONS = 2;
const PACKET_PALETTE = 3;

// ChatGPT's magical compact HSV->RGB function
// input/output range: 0-255
function HSVtoRGB({ h, s, v }) {
  s /= 255; v /= 255;
  let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
}

document.getElementById('slider_h').oninput = sendColorUpdate;
document.getElementById('slider_s').oninput = sendColorUpdate;
document.getElementById('slider_v').oninput = sendColorUpdate;
document.getElementById('slider_a').oninput = sendColorUpdate;


function syncPalette() {
    for (let i = 0; i < PALETTE_LEN; i++) {
        if ( !Object.values(palette[i]).every(v => !v) ) // only change color if not black, that means its unassigned
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
    sa = document.getElementById('slider_a');
    sh.value = color.h*4;
    ss.value = color.s*4;
    sv.value = color.v*4;
    sa.value = color.a*4;
    let rgb2 = HSVtoRGB({h:color.h,s:255,v:255});
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
                    if (data.length != 5) {
                        console.error("Invalid packet when syncing color");
                        break;
                    }
                    color = {
                        h: data[1],
                        s: data[2],
                        v: data[3],
                        a: data[4],
                    };

                    console.log("Syncing color:", color);
                    syncSliders();
                    break;

                case PACKET_PALETTE:
                    const length = data[1];

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
            throw err;
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
    
    const packet = new Uint8Array([PACKET_BUTTONS | PACKET_SEND_MASK, buttons]);
    ws.send( packet );
}
function dimButtonUpdate() {
    let btn = document.getElementById('dimbtn')
    buttons ^= DIM_BTN; //Flip state
    if (buttons & DIM_BTN) {
        btn.textContent = "Slider";
    } else {
        btn.textContent = "Gamma";
    }
    
    const packet = new Uint8Array([PACKET_BUTTONS | PACKET_SEND_MASK, buttons]);
    ws.send( packet );
}


function sendColorUpdate() {
    if (!synced) return;

    let sh,ss,sv,sa;
    sh = document.getElementById('slider_h');
    ss = document.getElementById('slider_s');
    sv = document.getElementById('slider_v');
    sa = document.getElementById('slider_a');
    let h = parseInt(sh.value) * 0.25; // 1024 -> 256
    let s = parseInt(ss.value) * 0.25; // 1024 -> 256
    let v = parseInt(sv.value) * 0.25; 
    let a = parseInt(sa.value) * 0.25;
    color = {h,s,v,a};
    syncSliders();

//    let rgb = HSVtoRGB(hsv);

    let data = new Uint8Array([PACKET_COLOR | PACKET_SEND_MASK, h, s, v, a]);
    if (ws.readyState === ws.OPEN)
        ws.send(data);
}
