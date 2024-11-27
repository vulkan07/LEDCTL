import websockets
import socket
import serial
import asyncio
import atexit
import time

## PACKET HEADERS ##
PACKET_RECEIVE_BIT = 128 
PACKET_RECEIVE_MASK = 0b00001111 
PACKET_COLOR = 1
PACKET_BUTTONS = 2
PACKET_PALETTE = 3

## SOCKET & USB SETTINGS ##
HTTP_PORT = 8080
USB_PORTS = ["/dev/ttyACM0", "/dev/ttyACM1", "/dev/ttyACM2"] 
USB_BAUD = 9600

## CONNECTIONS ##
sockets = set()
arduino = None

## LED CONTROLLER STATE ##
STATE_FILE = ".state"
color = [0,0,0,0]

PALETTE_LENGTH = 9
palette = []

POWER_BTN = 1
DIM_BTN = 2
buttons = 1 # power button starts with on

palette.append({"h":255,"s":255,"v":128,"a":255})
palette.append({"h":128,"s":255,"v":128,"a":255})
palette.append({"h":66,"s":255,"v":128,"a":255})
palette.append({"h":230,"s":100,"v":128,"a":155})

## EXPERIMENTAL GOOFY PHYSICS IDK LOGARITHM WTF GAMMA AND SHIT ##
def gamma_correct(value, gamma=1.8):
    return int((value / 255.0) ** gamma * 255)

# range: 0-255
def HSVtoRGB(hsv):
    h, s, v = hsv[0] / 255 * 360, hsv[1] / 255, hsv[2] / 255
    f = lambda n: v - v * s * max(min((n + h / 60) % 6, 4 - (n + h / 60) % 6, 1), 0)
    return [  round(f(5) * 255), round(f(3) * 255), round(f(1) * 255) ]

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


def colorToArduino():
    if arduino == None:
        arduino_connect()
        return
    try:
        rgb = HSVtoRGB(color)
        rgba = [0,0,0,0]

        if buttons & POWER_BTN:
            rgba[3] = color[3]

        for i in range(3):
            rgba[i] = rgb[i] ## SKIPPING GAMMA CORRECTION

        print(rgba)
        arduino.write(rgba)

    except Exception as e:
        print("Arduino connection failed:", e, "(reconnecting...)")
        raise e
        arduino_connect()


async def sync(current):
    global sockets
    newset = {current}
    for socket in sockets:
        if socket != current: # dont sync with packet sender
            data = [PACKET_COLOR, color[0], color[1], color[2], color[3]]
            try: 
                await socket.send(bytes(data))
                newset.add(socket)
            except websockets.exceptions.ConnectionClosed as e:
                print(f"Connection Closed: {current.remote_address} - {e}")
    sockets = newset


async def websocket_receive(websocket, path):
    sockets.add(websocket)
    try:
        async for message in websocket:
            if not isinstance(message, bytes):
                print("Message not Byte Array")
                continue
#            print( [bin(x) for x in message] )

            if message[0] & PACKET_RECEIVE_MASK == PACKET_COLOR:
                global color
                if message[0] & PACKET_RECEIVE_BIT:
                    ## RECEIVE RGB
                    color = list(message[1::])
                  ##  print(color)
                    colorToArduino()
                    await sync(websocket)
                else:
                    ## SEND RGB
                    print(f"Syncing color for {websocket.remote_address[0]}")
                    data = [PACKET_COLOR, color[0], color[1], color[2], color[3]]
                    await websocket.send(bytes(data))
                continue

            if message[0] & PACKET_RECEIVE_MASK == PACKET_PALETTE:
                if message[0] & PACKET_RECEIVE_BIT:
                    print(f"Receiving palette from {websocket.remote_address[0]}")
                    print("not implemented!!!!!!!!!!!!!!444")
                else:
                    print(f"Syncing palette for {websocket.remote_address[0]}")
                    data = [PACKET_PALETTE, PALETTE_LENGTH]
                    for i in range(PALETTE_LENGTH):
                        if (i >= len(palette)):
                            data.append(0)
                            data.append(0)
                            data.append(0)
                            data.append(0)
                            continue
                        c = palette[i]
                        data.append(c["h"])
                        data.append(c["s"])
                        data.append(c["v"])
                        data.append(c["a"])

                    await websocket.send(bytes(data))
                continue

            if message[0] & PACKET_RECEIVE_MASK == PACKET_BUTTONS:
                global buttons
                if message[0] & PACKET_RECEIVE_BIT:
                    print(f"Receiving buttons from {websocket.remote_address[0]}")
                    buttons = message[1]
                    colorToArduino()
                    print(bin(buttons))
                else:
                    print(f"Syncing buttons for {websocket.remote_address[0]}")
                    await websocket.send(bytes([PACKET_BUTTONS, buttons]))
                continue

            print(f"Invalid packet: {bin(message[0])}")

    except websockets.exceptions.ConnectionClosed as e:
        print(f"Connection Closed: {websocket.remote_address[0]} - {e}")
        sockets.remove(websocket)



def loadState():
    global color
    try:
        with open(STATE_FILE, "rb") as f:
            data = f.read()
            color = list(data)

        print(f"Restored state from '{STATE_FILE}': {color}")
    except Exception as e:
        print(f"Cannot restore state from '{STATE_FILE}': {e}")


def saveState():
    with open(STATE_FILE, "wb") as of:
        of.write(bytes(color))
    print(f"Saved state to '{STATE_FILE}': {color}")

atexit.register(saveState)

async def start_server():

    loadState()
    arduino_connect()
    if arduino != None:
        colorToArduino()

    async with websockets.serve(websocket_receive, "0.0.0.0", HTTP_PORT):
        print(f"WebSocket started on {HTTP_PORT}")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(start_server())

