import websockets
import socket
import serial
import asyncio
import atexit
import time

## PACKET HEADERS ##
# use 0xA0 (1010 0000) mask for header's first 4 bits?
PACKET_RGB = 0x01
PACKET_SYNC_RGB = 0x02
PACKET_SYNC_BUTTONS = 0x03

## SOCKET & USB SETTINGS ##
HTTP_PORT = 8080
USB_PORTS = ["/dev/ttyACM0", "/dev/ttyACM1", "/dev/ttyACM2"] 
USB_BAUD = 9600

## CONNECTIONS ##
sockets = set()
arduino = None

## LED CONTROLLER STATE ##
STATE_FILE = ".state"
rgb = [0,0,0]
palette = [
        {"r":255, "g":0, "b":0},
        {"r":255, "g":255, "b":0},
        {"r":0, "g":0, "b":255},
        {"r":0, "g":0, "b":0}
]

## EXPERIMENTAL GOOFY PHYSICS IDK LOGARITHM WTF GAMMA AND SHIT ##
def gamma_correct(value, gamma=1.8):
    return int((value / 255.0) ** gamma * 255)

def arduino_connect():
    global arduino
    print("Connecting to Arduino on ", end="")
    for port in USB_PORTS:
        print(f"'{port}'", end="", flush=True)
        try:
            arduino = serial.Serial(port=port, baudrate=USB_BAUD, timeout=.1)
            time.sleep(1.9)
            print(f"(success)")
            return
        except Exception as e:
            print(f"(fail), ", end="")
    print()


def sendUART():
    if arduino == None:
        arduino_connect()
        return
    try:
        rgb2 = [0,0,0]
        for i in range(3):
            rgb2[i] = gamma_correct(rgb[i])
        arduino.write(rgb2)
    except Exception as e:
        print("Arduino connection failed:", e, "(reconnecting...)")
        arduino_connect()


async def sync(current):
    global sockets
    newset = {current}
    for socket in sockets:
        if socket != current: # dont sync with packet sender
            data = [PACKET_SYNC_RGB, rgb[0], rgb[1], rgb[2]]
            try: 
                await socket.send(bytes(data))
                newset.add(socket)
            except websockets.exceptions.ConnectionClosed as e:
                print(f"Connection Closed: {current.remote_address} - {e}")
    sockets = newset


async def websocket_receive(websocket, path):
    global rgb
    sockets.add(websocket)
    try:
        async for message in websocket:
            if not isinstance(message, bytes):
                print("Message not Byte Array")
                continue
#            print(message.hex())

            if message[0] == PACKET_SYNC_RGB:
                print(f"Syncing color for {websocket.remote_address[0]}")
                data = [PACKET_SYNC_RGB, rgb[0], rgb[1], rgb[2]]
                await websocket.send(bytes(data))
                continue
            if message[0] == PACKET_SYNC_BUTTONS:
                print(f"Syncing buttons for {websocket.remote_address[0]}")
                #data = [PACKET_SYNC_BUTTONS, 0b00001010, 4, 255,0,0, 0,255,0, 0,0,255, 255,255,255]
                data = [PACKET_SYNC_BUTTONS, len(palette)+1, 0b00001111]
                for color in palette:
                    data.append(color["r"]);
                    data.append(color["g"]);
                    data.append(color["b"]);

                await websocket.send(bytes(data))
                continue

            if message[0] == PACKET_RGB and len(message) == 4:
                rgb = list(message[1::])
                sendUART()
                await sync(websocket)

            else:
                print("Invalid packet format")

    except websockets.exceptions.ConnectionClosed as e:
        print(f"Connection Closed: {websocket.remote_address[0]} - {e}")
        sockets.remove(websocket)



def loadState():
    global rgb
    try:
        with open(STATE_FILE, "rb") as f:
            data = f.read()
            rgb = list(data)

        print(f"Restored state from '{STATE_FILE}': {rgb}")
    except Exception as e:
        print(f"Cannot restore state from '{STATE_FILE}': {e}")


def saveState():
    with open(STATE_FILE, "wb") as of:
        of.write(bytes(rgb))
    print(f"Saved state to '{STATE_FILE}': {rgb}")

atexit.register(saveState)

async def start_server():

    loadState()
    arduino_connect()
    if arduino != None:
        sendUART()

    async with websockets.serve(websocket_receive, "0.0.0.0", HTTP_PORT):
        print(f"WebSocket started on {HTTP_PORT}")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(start_server())

