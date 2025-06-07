// Initialize constants and variables
const screen = document.getElementById("screen");
const ctx = screen.getContext("2d", { willReadFrequently: true });
const toRadians = (deg) => deg * (Math.PI / 180);

/* <-- Edittable --> */
const camera = { x: 0, y: 0, z: 5, pitch: 0, yaw: toRadians(180), roll: 0 };
const FOV = toRadians(90);
const playerSpeed = 0.1;
const rotSpeed = 0.1;
const mouseSensitivity = 0.05;
/* <---------------> */

let resizeTimeout;
let imageData;
let zBuffer;
let projected = [];
let lastTimestamp = performance.now();
let keys = {};
let objects = [];

class Triangle {
	constructor(v1, v2, v3, color = randomColor()) {
		this.v1 = v1;
		this.v2 = v2;
		this.v3 = v3;
		this.color = color;
	}

	draw(imageData, zBuffer) {
		const width = screen.width;
		const height = screen.height;

		const pixels = imageData.data;
		const [r, g, b] = this.color;

		const A = this.v1;
		const B = this.v2;
		const C = this.v3;

		// Stop offscreen rendering
		if (
			(A.x < 0 && B.x < 0 && C.x < 0) ||
			(A.x > width && B.x > width && C.x > width) ||
			(A.y < 0 && B.y < 0 && C.y < 0) ||
			(A.y > height && B.y > height && C.y > height)
		) {
			return;
		}

		// Get area of the square defined by the triangle
		let minX = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x)));
		let maxX = Math.min(screen.width - 1, Math.ceil(Math.max(A.x, B.x, C.x)));
		let minY = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y)));
		let maxY = Math.min(screen.height - 1, Math.ceil(Math.max(A.y, B.y, C.y)));

		// Calculate signed area of the triangle
		const edgeEval = (a, b, c) =>
			(c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);

		const area = edgeEval(A, B, C);
		const invArea = 1 / area; // Pre-calculate the inverse area to save calculations
		if (area === 0) return;

		for (let y = minY; y < maxY; y++) {
			for (let x = minX; x < maxX; x++) {
				// Since the canvas is a 1D arry, get the y location, and add the x to get
				// the right index
				const index = y * width + x;
				// Since each pixel has four values, multiply by 4 to
				// reach the correct location
				const pixelIndex = index * 4;

				const P = { x, y };

				// Get signed area of each of the sub-sections of the triangle
				const w0 = edgeEval(P, B, C);
				const w1 = edgeEval(P, C, A);
				const w2 = edgeEval(P, A, B);

				// If pixel is not outside of the triangle, draw
				if (
					(w0 >= 0 && w1 >= 0 && w2 >= 0) ||
					(w0 <= 0 && w1 <= 0 && w2 <= 0)
				) {
					// Calculate depth and baycentric coordinates
					const alpha = w0 * invArea;
					const beta = w1 * invArea;
					const gamma = w2 * invArea;
					const depth = alpha * A.z + beta * B.z + gamma * C.z;

					// If the current pixel is closer than the previous location, draw
					// and replace it in the zBuffer
					if (depth < zBuffer[index]) {
						zBuffer[index] = depth;

						pixels[pixelIndex] = r;
						pixels[pixelIndex + 1] = g;
						pixels[pixelIndex + 2] = b;
						pixels[pixelIndex + 3] = 255;
					}
				}
			}
		}
	}
}

class Vector3 {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
}

//* <-- General things --> */
// Most functions are for handling movement, resizing, etc

// Handles screen resizing
function resizeCanvas() {
	// Clear screen and zBuffer, and update window size
	screen.width = window.innerWidth;
	screen.height = window.innerHeight;
	ctx.clearRect(0, 0, screen.width, screen.height);
	zBuffer = new Float32Array(screen.width * screen.height).fill(Infinity);
	imageData = ctx.createImageData(screen.width, screen.height);
}

// Handles mouse movement
function onMouseMove(event) {
	const dx = event.movementX;
	const dy = event.movementY;
	camera.yaw -= dx * rotSpeed * mouseSensitivity;
	camera.pitch += dy * rotSpeed * mouseSensitivity;
	camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.pitch));
}

// Clear screen
function clearImageData(imageData) {
	const data = imageData.data;
	for (let i = 0; i < data.length; i += 4) {
		data[i] = 0;
		data[i + 1] = 0;
		data[i + 2] = 0;
		data[i + 3] = 255;
	}
}

// Handles player movement
function handlePlayerMovement(deltaTime) {
	const speed = playerSpeed * deltaTime * 60;

	const forward = {
		x: -Math.sin(camera.yaw),
		z: Math.cos(camera.yaw),
	};

	const right = {
		x: Math.cos(camera.yaw),
		z: Math.sin(camera.yaw),
	};

	if (keys["w"]) {
		camera.x += forward.x * speed;
		camera.z += forward.z * speed;
	}
	if (keys["s"]) {
		camera.x -= forward.x * speed;
		camera.z -= forward.z * speed;
	}
	if (keys["a"]) {
		camera.x -= right.x * speed;
		camera.z -= right.z * speed;
	}
	if (keys["d"]) {
		camera.x += right.x * speed;
		camera.z += right.z * speed;
	}

	if (keys["control"]) camera.y -= speed;
	if (keys[" "]) camera.y += speed;
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
function getObjFiles() {
	fetch("manifest.json")
		.then((response) => response.json())
		.then((fileList) => {
			return Promise.all(
				fileList.map((filename) =>
					fetch(`Objects/${filename}`)
						.then((response) => response.text())
						.then((data) => parseObj(data))
						.catch((err) => console.error(`Failed to load ${filename}:`, err))
				)
			);
		})
		.catch((err) => console.error("Failed to load manifest.json:", err));
}

// and push all the objects to the objects list
function parseObj(data) {
	const lines = data.split("\n");
	let vertices = [];
	let object = [];

	for (let line of lines) {
		line = line.trim();
		if (line.startsWith("v ")) {
			const parts = line.split(/\s+/);
			const x = parseFloat(parts[1]);
			const y = parseFloat(parts[2]);
			const z = parseFloat(parts[3]);
			vertices.push(new Vector3(x, y, z));
		} else if (line.startsWith("f ")) {
			const parts = line.split(/\s+/);

			const v1 = parseInt(parts[1].split("/")[0]) - 1;
			const v2 = parseInt(parts[2].split("/")[0]) - 1;
			const v3 = parseInt(parts[3].split("/")[0]) - 1;

			object.push([vertices[v1], vertices[v2], vertices[v3], randomColor()]);
		}
	}

	objects.push(object);
}

/* <--------------------> */

// Get the projected values for a vector
function getProjected(vec) {
	const focalLength = screen.height / 2 / Math.tan(FOV / 2);
	const cx = screen.width / 2;
	const cy = screen.height / 2;

	let x = vec.x - camera.x;
	let y = vec.y - camera.y;
	let z = vec.z - camera.z;

	const cosYaw = Math.cos(-camera.yaw);
	const sinYaw = Math.sin(-camera.yaw);
	const cosPitch = Math.cos(-camera.pitch);
	const sinPitch = Math.sin(-camera.pitch);
	const cosRoll = Math.cos(-camera.roll);
	const sinRoll = Math.sin(-camera.roll);

	// Yaw (rotate around Y)
	let x1 = cosYaw * x - sinYaw * z;
	let z1 = sinYaw * x + cosYaw * z;
	x = x1;
	z = z1;

	// Pitch (rotate around X)
	let y1 = cosPitch * y - sinPitch * z;
	let z2 = sinPitch * y + cosPitch * z;
	y = y1;
	z = z2;

	// Roll (optional - rotate around Z)
	let x2 = cosRoll * x - sinRoll * y;
	let y2 = sinRoll * x + cosRoll * y;
	x = x2;
	y = y2;

	if (z <= 0.01) z = 0.01;

	const projectedX = cx + (x * focalLength) / z;
	const projectedY = cy - (y * focalLength) / z;

	return { x: projectedX, y: projectedY, z: z };
}

// Check if a vector is too far or near to be rendered
function zClipping(vertices, color) {
	const NEAR = 0.1;

	// Find intersection point between a line segment and the near plane (z = NEAR)
	function intersectNearPlane(p1, p2) {
		const t = (NEAR - p1.z) / (p2.z - p1.z); // Linear interpolation factor
		return new Vector3(
			p1.x + t * (p2.x - p1.x),
			p1.y + t * (p2.y - p1.y),
			NEAR // Clamped to the near plane
		);
	}

	// Separate the triangle's vertices into inside and outside the near plane
	const inside = vertices.filter((v) => v.z >= NEAR);
	const outside = vertices.filter((v) => v.z < NEAR);

	// If all vertices are behind the near plane, don't render
	if (inside.length === 0) return [];

	//  If all vertices are in front of the near plane — return the original triangle
	if (inside.length === 3) {
		return [new Triangle(...inside, color)];
	}

	// If one vertex is inside, two are outside then
	// clip and return a single smaller triangle
	else if (inside.length === 1 && outside.length === 2) {
		const i1 = intersectNearPlane(inside[0], outside[0]); // Intersection with 1st outside vertex
		const i2 = intersectNearPlane(inside[0], outside[1]); // Intersection with 2nd outside vertex
		return [new Triangle(inside[0], i1, i2, color)];
	}

	// If two vertices are inside and one is outside
	// then clip and return two triangles to maintain shape
	else if (inside.length === 2 && outside.length === 1) {
		const i1 = intersectNearPlane(inside[0], outside[0]); // Intersection from 1st inside vertex
		const i2 = intersectNearPlane(inside[1], outside[0]); // Intersection from 2nd inside vertex
		return [
			new Triangle(inside[0], inside[1], i1, color),
			new Triangle(inside[1], i1, i2, color),
		];
	}

	// Fallback — shouldn't reach here for valid triangles
	return [];
}

// Check if a vector is facing away from the camera by checking
// its cross product
function isBackFace(v0, v1, v2) {
	const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y };
	const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y };
	const cross = edge1.x * edge2.y - edge1.y * edge2.x;

	return cross < 0;
}

// Rotate and project a triangle
function updateVertices(original, angleX, angleY, angleZ) {
	// Rotate the triangle
	function rotate(v, angleX, angleY, angleZ) {
		const cosX = Math.cos(angleX);
		const sinX = Math.sin(angleX);
		const cosY = Math.cos(angleY);
		const sinY = Math.sin(angleY);
		const cosZ = Math.cos(angleZ);
		const sinZ = Math.sin(angleZ);

		let x = v.x;
		let y = v.y;
		let z = v.z;

		// Rotate around X
		let y1 = y * cosX - z * sinX;
		let z1 = y * sinX + z * cosX;

		y = y1;
		z = z1;

		// Rotate around Y
		let x1 = x * cosY + z * sinY;
		let z2 = -x * sinY + z * cosY;

		x = x1;
		z = z2;

		// Rotate around Z
		let x2 = x * cosZ - y * sinZ;
		let y2 = x * sinZ + y * cosZ;

		return new Vector3(x2, y2, z);
	}

	projected = [];

	// Loop through the triangle's vectors and rotate them
	for (let i = 0; i < original.length; i++) {
		const [v1, v2, v3, color] = original[i];
		const rv1 = rotate(v1, angleX, angleY, angleZ);
		const rv2 = rotate(v2, angleX, angleY, angleZ);
		const rv3 = rotate(v3, angleX, angleY, angleZ);

		// Return the projected vector and push it to the projected list
		projected.push([
			getProjected(rv1),
			getProjected(rv2),
			getProjected(rv3),
			color,
		]);
	}
}

// Draw all the projected triangles
function rasterizeTriangle() {
	for (let i = 0; i < projected.length; i++) {
		const proj = projected[i];
		const v0 = proj[0];
		const v1 = proj[1];
		const v2 = proj[2];

		// If the triangle is not on screen, don't render
		if (isBackFace(v0, v1, v2)) continue;

		// Z-Clip the remaining trangles
		const clipped = zClipping([v0, v1, v2], proj[3]);

		// Draw the clipped triangles
		for (const tri of clipped) {
			tri.draw(imageData, zBuffer);
		}
	}
}

// The main loop
function renderFrame(timestamp) {
	const deltaTime = (timestamp - lastTimestamp) / 1000;
	lastTimestamp = timestamp;

	handlePlayerMovement(deltaTime);

	// Clear screen and zBuffer
	ctx.clearRect(0, 0, screen.width, screen.height);
	clearImageData(imageData);
	zBuffer.fill(Infinity);

	// Go through all the objects and render them
	for (object of objects) {
		updateVertices(object, 0, 0, 0);
		rasterizeTriangle();
	}

	// Update screen
	ctx.putImageData(imageData, 0, 0);
	requestAnimationFrame(renderFrame);
}

resizeCanvas();
getObjFiles();
renderFrame(lastTimestamp);
