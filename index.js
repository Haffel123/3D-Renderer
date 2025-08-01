// Initialize constants and variables
const screen = document.getElementById("screen");
const mathWorker = new Worker("transformObject.js");
let aspect = screen.width / screen.height;
const ctx = screen.getContext("2d", { willReadFrequently: true });
const toRadians = (deg) => deg * (Math.PI / 180);

/* <-- Edittable --> */
const camera = {
	x: 0,
	y: 0,
	z: 5,
	pitch: 0,
	yaw: toRadians(180),
	roll: 0,
	cosPitch: Math.cos(0),
	sinPitch: Math.sin(0),
	cosYaw: Math.cos(toRadians(180)),
	sinYaw: Math.sin(toRadians(180)),
	cosRoll: Math.cos(0),
	sinRoll: Math.sin(0),
};

const FOVy = toRadians(60);
let FOVx = 2 * Math.atan(aspect * Math.tan(FOVy / 2));

const NEAR = 0.1;
const FAR = 50;

const playerSpeed = 6;
const rotSpeed = 0.1;
const mouseSensitivity = 0.05;
/* <---------------> */

let resizeTimeout;
let imageData;
let pixelBuffer = new Uint8ClampedArray(screen.width * screen.height * 4);
let zBuffer;
let framePending = false;
let lastTimestamp = performance.now();
let keys = {};
let objects = [];

function Vector3(x, y, z) {
	return { x, y, z };
}

//* <-- General things --> */
// Most functions are for handling movement, resizing, etc

// Handles screen resizing
function resizeCanvas() {
	// Clear screen and zBuffer, and update window size
	screen.width = window.innerWidth;
	screen.height = window.innerHeight;
	aspect = screen.width / screen.height;
	FOVx = 2 * Math.atan(aspect * Math.tan(FOVy / 2));

	zBuffer = new Float32Array(screen.width * screen.height).fill(Infinity);
	imageData = ctx.createImageData(screen.width, screen.height);
	pixelBuffer = new Uint8ClampedArray(screen.width * screen.height * 4);
}

// Helper Function to calculate camera cos and sin values
function updateCameraTrigValues() {
	camera.cosPitch = Math.cos(camera.pitch);
	camera.sinPitch = Math.sin(camera.pitch);
	camera.cosYaw = Math.cos(camera.yaw);
	camera.sinYaw = Math.sin(camera.yaw);
	camera.cosRoll = Math.cos(camera.roll);
	camera.sinRoll = Math.sin(camera.roll);
}

// Handles mouse movement
function onMouseMove(event) {
	if (document.pointerLockElement !== screen) return;

	const dx = event.movementX;
	const dy = event.movementY;
	if (dx === 0 && dy === 0) return;

	camera.pitch -= dy * rotSpeed * mouseSensitivity;
	camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.pitch));

	camera.yaw -= dx * rotSpeed * mouseSensitivity;
	camera.yaw = (camera.yaw + 2 * Math.PI) % (2 * Math.PI);

	updateCameraTrigValues();
}

// Clear screen
function clearImageData(imageData) {
	const data = imageData.data;
	const row = new Uint8ClampedArray(screen.width * 4);
	for (let i = 0; i < screen.width; i++) row.set([0, 0, 0, 255], i * 4);
	for (let y = 0; y < screen.height; y++) data.set(row, y * screen.width * 4);
}

function normalize(v) {
	const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
	return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : v;
}

// Handles player movement
function handlePlayerMovement(deltaTime) {
	const speed = playerSpeed * deltaTime;

	// Calculate forward vector on XZ plane (ignore pitch)
	const forward = {
		x: Math.sin(camera.yaw),
		y: 0,
		z: -Math.cos(camera.yaw),
	};

	// Calculate right vector on XZ plane
	const right = {
		x: Math.cos(camera.yaw),
		y: 0,
		z: Math.sin(camera.yaw),
	};

	if (keys["w"]) {
		camera.x -= forward.x * speed;
		camera.z -= forward.z * speed;
	}
	if (keys["s"]) {
		camera.x += forward.x * speed;
		camera.z += forward.z * speed;
	}
	if (keys["a"]) {
		camera.x -= right.x * speed;
		camera.z -= right.z * speed;
	}
	if (keys["d"]) {
		camera.x += right.x * speed;
		camera.z += right.z * speed;
	}
	if (keys[" "]) {
		camera.y += speed;
	}
	if (keys["control"]) {
		camera.y -= speed;
	}
}

// Returns a random RGB value
function randomColor() {
	return [
		Math.floor(Math.random() * 256),
		Math.floor(Math.random() * 256),
		Math.floor(Math.random() * 256),
	];
}

/*/ <-- Add all necessary event listeners --> */
window.addEventListener("resize", () => {
	clearTimeout(resizeTimeout);
	resizeTimeout = setTimeout(resizeCanvas, 100);
});

window.addEventListener("keydown", (e) => {
	keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (e) => {
	keys[e.key.toLowerCase()] = false;
});

screen.addEventListener("click", () => {
	screen.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
	if (document.pointerLockElement === screen) {
		document.addEventListener("mousemove", onMouseMove);
	} else {
		document.removeEventListener("mousemove", onMouseMove);
	}
});
/*/ <---------------------------------------> */

// Get .obj files, parse them,
async function getObjFiles() {
	const response = await fetch("manifest.json");
	const fileList = await response.json();
	return await Promise.all(
		fileList.map((filename) =>
			fetch(`Objects/${filename}`)
				.then((response_1) => response_1.text())
				.then((data) => parseObj(data))
		)
	);
}

// and push all the objects to the objects list
function parseObj(data) {
	const lines = data.split("\n");
	let vertices = [];
	let indices = [];

	for (let line of lines) {
		line = line.trim();
		if (line.startsWith("v ")) {
			const parts = line.split(/\s+/);
			const x = parseFloat(parts[1]);
			const y = parseFloat(parts[2]);
			const z = parseFloat(parts[3]);
			vertices.push(Vector3(x, y, z));
		} else if (line.startsWith("f ")) {
			const parts = line.split(/\s+/);

			const v1 = parseInt(parts[1].split("/")[0]) - 1;
			const v2 = parseInt(parts[2].split("/")[0]) - 1;
			const v3 = parseInt(parts[3].split("/")[0]) - 1;

			indices.push([v1, v2, v3, randomColor()]);
		}
	}

	objects.push({ vertices, indices });
}

/* <--------------------> */

// The main loop
function renderFrame(timestamp) {
	if (framePending) return; // Wait for worker
	framePending = true;

	handlePlayerMovement((timestamp - lastTimestamp) / 1000);
	lastTimestamp = timestamp;

	const cameraSnapshot = { ...camera };

	zBuffer.fill(Infinity);
	pixelBuffer.fill(0);

	mathWorker.postMessage(
		{
			camera: cameraSnapshot,
			screenHeight: screen.height,
			screenWidth: screen.width,
			zBuffer: zBuffer.buffer,
			pixels: pixelBuffer.buffer,
			FOVy,
			FOVx,
			NEAR,
			FAR,
		},
		[zBuffer.buffer, pixelBuffer.buffer]
	);
}

mathWorker.onmessage = function (e) {
	zBuffer = new Float32Array(e.data.zBuffer);
	pixelBuffer = new Uint8ClampedArray(e.data.pixels);
	imageData.data.set(pixelBuffer);
	ctx.putImageData(imageData, 0, 0);

	framePending = false;

	requestAnimationFrame(renderFrame);
};

resizeCanvas();
onMouseMove({ movementX: 0, movementY: 0 });
updateCameraTrigValues();
getObjFiles().then(() => {
	mathWorker.postMessage({
		type: "init",
		objects: objects.map((obj) => ({
			vertices: obj.vertices.map((v) => [v.x, v.y, v.z]),
			indices: obj.indices,
		})),
	}); // send ONCE
	renderFrame(lastTimestamp);
});
