let ws = null;
const ws_address = "ws://" + window.location.hostname + ":8080"
let retryInterval = 100;
let synced = false;

let color = {h:0, s:0, v:0, a:0};

const PALETTE_LEN = 9;
let palette = [];

const POWER_BTN = 1;
let buttons = 0; // 8 bits each correspond to a button defined above
let colorSaving = false;

const PACKET_SEND_MASK = 128;
const PACKET_COLOR = 1;
const PACKET_BUTTONS = 2;
const PACKET_PALETTE = 3;


document.getElementById('slider_h').oninput = onSlider;
document.getElementById('slider_s').oninput = onSlider;
document.getElementById('slider_v').oninput = onSlider;
document.getElementById('slider_a').oninput = onSlider;


function sendData(data) {
//    if (ws.readyState === ws.OPEN)
        ws.send(data);
}

// ChatGPT's magical compact HSV->RGB function
// input/output range: 0-255
function HSVtoRGB({ h, s, v }) {
  h *= 1.43;s /= 255; v /= 255;
  let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
}

function syncPalette() {
    for (let i = 0; i < PALETTE_LEN; i++) {
        if ( Object.values(palette[i]).every(v => !v) ) { // only change color if not black, that means its unassigned
            document.getElementById("btn"+(i+1)).style.background = "unset";
            continue;
        }

        const rgb2 = HSVtoRGB({h:palette[i].h,s:palette[i].s,v:palette[i].v});
        document.getElementById("btn"+(i+1)).style.background = "rgb("+ rgb2.r + "," + rgb2.g + "," + rgb2.b + ")";
    }
}
function setButtonClass(element, classname, set) {
    element.classList.remove("depressed");
    if (set) element.classList.add(classname);
    else element.classList.remove(classname);
    
}
function syncButtons() {
    setButtonClass(document.getElementById('powerbtn'), "pressed", buttons & 1);
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
    const rgb2 = HSVtoRGB({h:color.h,s:255,v:255});
    ss.style.backgroundImage = "linear-gradient(90deg, gray, rgb(" + rgb2.r + "," + rgb2.g + "," + rgb2.b + "))";
    sv.style.backgroundImage = "linear-gradient(90deg, black, rgb(" + rgb2.r + "," + rgb2.g + "," + rgb2.b + "))";
}

function connectWebSocket() {
    console.log("Connecting to WebSocket");
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

                    if (!synced) console.log("Syncing color:", color);
                    syncSliders();
                    break;

                case PACKET_PALETTE:
                    const length = data[1];

                    let j = 0;
                    for (let i = 2; i < length*4; i+=4) {
                        palette[j] = {h:data[i], s:data[i+1], v:data[i+2], a:data[i+3]};
                        j++;
                    }
                    syncPalette();
                    console.log("Syncing palette");
                    break;

                case PACKET_BUTTONS:
                    buttons = data[1];
                    syncButtons();
                    console.log("Syncing buttons");
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

        sendData( new Uint8Array([PACKET_COLOR]) );
        sendData( new Uint8Array([PACKET_BUTTONS]) );
        sendData( new Uint8Array([PACKET_PALETTE]) );
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
    sendData( packet );
}

function colorSaveButton() {
    colorSaving = !colorSaving;
    setButtonClass(document.getElementById('savebtn'), 'pressed', colorSaving);
}

// index=-1 means no button was pressed, used for deselecting, when a slider is moved
function colorButton(index) {
    
    if (colorSaving) {
        palette[index-1] = {
            h: parseInt(document.getElementById('slider_h').value*0.25),
            s: parseInt(document.getElementById('slider_s').value*0.25),
            v: parseInt(document.getElementById('slider_v').value*0.25),
            a: parseInt(document.getElementById('slider_a').value*0.25)
        };
        syncPalette();
        colorSaving = false;
        setButtonClass(document.getElementById('savebtn'), 'pressed', false);
        let btn;
        for (let i = 1; i <= PALETTE_LEN; i++) {
            btn = document.getElementById('btn'+i);
            if (i === index)
                btn.classList.add("pressed");
            else
                btn.classList.remove("pressed");
        }

        sendPaletteUpdate();
        return;
    }
    
    if ( index !== -1 && Object.values(palette[index-1]).every(v => !v) ) // only change color if not black, that means its unassigned
        return;

    let btn;
    for (let i = 1; i <= PALETTE_LEN; i++) {
        btn = document.getElementById('btn'+i);
        if (i === index)
            btn.classList.add("pressed");
        else
            btn.classList.remove("pressed");
    }
    
    if (index === -1) return;

    color = {
        h: palette[index-1].h,
        s: palette[index-1].s,
        v: palette[index-1].v,
        a: palette[index-1].a,
    };
    syncSliders();

    const packet = new Uint8Array([PACKET_BUTTONS | PACKET_SEND_MASK, buttons]);
    sendData( packet );
    sendColorUpdate();
}

function onSlider() {
    colorButton(-1); // unselect selected color
    sendColorUpdate();
}

function sendPaletteUpdate() {
    if (!synced) return;

    let data = [PACKET_PALETTE | PACKET_SEND_MASK, PALETTE_LEN];
    for (let i = 0; i < PALETTE_LEN; i++) {
        data.push(palette[i].h);
        data.push(palette[i].s);
        data.push(palette[i].v);
        data.push(palette[i].a);
    }
    console.log(data);

    sendData(new Uint8Array(data));
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

    let data = new Uint8Array([PACKET_COLOR | PACKET_SEND_MASK, h, s, v, a]);
    sendData(data);
}


  const resizeOps = () => document.documentElement.style.setProperty("--vh", window.innerHeight * 0.01 + "px");
  resizeOps();
  window.addEventListener("resize", resizeOps);
