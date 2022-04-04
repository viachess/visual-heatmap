const HORIZONTAL_HEATMAP = "horizontal";
const CIRCLE_HEATMAP = "circle";

const isNumber = (param) => typeof param === 'number';
const NOT_A_NUMBER_TYPE_ERROR_MESSAGE = 'Wrong parameter type, must be a number';
const isUndefined = (param) => param === undefined;
const UNDEFINED_PARAM_ERROR_MESSAGE = 'Parameter is undefined, pass number as a parameter';

function checkNumberParameter (param) {
	if (isUndefined(param)) {
		throw new ReferenceError(UNDEFINED_PARAM_ERROR_MESSAGE);
	} else if (!isNumber(param)) {
		throw new TypeError(NOT_A_NUMBER_TYPE_ERROR_MESSAGE);
	}
}

// function getClosestNumber (array, goal) {
// 	const closest = array.reduce(function (prev, curr) {
// 		return (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev);
// 	});
// 	return closest;
// }

function getPixelRatio (ctx) {
	const dpr = window.devicePixelRatio || 1;
	const bsr = ctx.webkitBackingStorePixelRatio ||
        ctx.mozBackingStorePixelRatio ||
        ctx.msBackingStorePixelRatio ||
        ctx.oBackingStorePixelRatio ||
        ctx.backingStorePixelRatio || 1;

	return dpr / bsr;
}

var GradvertexShader = `
	attribute vec2 a_position;
	attribute float a_intensity;
	uniform float u_size;
	uniform vec2 u_resolution;
	uniform vec2 u_translate; 
	uniform float u_zoom; 
	uniform float u_angle; 
	uniform float u_density;
	varying float v_i;

	vec2 rotation(vec2 v, float a) {
		float s = sin(a); float c = cos(a); mat2 m = mat2(c, -s, s, c); 
		return m * v;
	}

	void main() {
		vec2 zeroToOne = (a_position * u_density + u_translate * u_density) / (u_resolution);
		vec2 zeroToTwo = zeroToOne * 2.0 - 1.0;
		zeroToTwo = zeroToTwo / u_zoom;
		if (u_angle != 0.0) {
			zeroToTwo = rotation(zeroToTwo, u_angle);
		}
		gl_Position = vec4(zeroToTwo , 0, 1);
		gl_PointSize = u_size * u_density;
		v_i = a_intensity;
	}`;

var GradfragmentShader = `
	precision mediump float;
	uniform float u_max;
	uniform float u_blur;
	varying float v_i;
	void main() {
		float r = 0.0; 
		vec2 cxy = 2.0 * gl_PointCoord - 1.0;
		r = dot(cxy, cxy);
		if(r <= 1.0) {
			gl_FragColor = vec4(0, 0, 0, (v_i/u_max) * u_blur * (1.0 - sqrt(r)));
		}
	}`;


var ColorvertexShader = `
	attribute vec2 a_texCoord;
	varying vec2 v_texCoord;
	void main() {
		vec2 clipSpace = a_texCoord * 2.0 - 1.0;
		gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
		v_texCoord = a_texCoord;
	}`;

// u_colorArr[100] means that this uniform takes up uniform 100 locations
var ColorfragmentShader = `
	precision mediump float;
	varying vec2 v_texCoord;
	uniform sampler2D u_framebuffer; 
	uniform vec4 u_colorArr[100]; 
	uniform float u_colorCount; 
	uniform float u_offset[100];
	uniform float u_opacity; 
	
	float remap ( float minval, float maxval, float curval ) {
		return ( curval - minval ) / ( maxval - minval );
	}

	void main() {
		float alpha = texture2D(u_framebuffer, v_texCoord.xy).a;
		int matchFound = 0;
		if (alpha > 0.0 && alpha <= 1.0) {
			vec4 color_;
			if (alpha <= u_offset[0]) {
				color_ = u_colorArr[0];
				matchFound = 1;
			}

			for (int i=1; i<10; ++i) 
			{
				if (alpha <= u_offset[i] && matchFound != 1) {
					color_ = mix( u_colorArr[i-1], u_colorArr[i], remap( u_offset[i-1], u_offset[i], alpha ) );
					matchFound = 1;
				}
			}

			if (matchFound != 1) {
				color_ = vec4(0.0, 0.0, 0.0, 0.0);
			}

			// adjust color alpha channel to match config opacity parameter
			color_.a = color_.a - (1.0 - u_opacity);

			if (color_.a < 0.0) {
				color_.a = 0.0;
			}
			gl_FragColor = color_;
		}
	}`;
	
// exData is positions in posVec float32array and rVec for values, float32array as well

var rectangleVertexShader = `
	uniform vec2 u_resolution;
	uniform float u_max;

	attribute vec4 a_position;
	attribute vec2 a_texcoord;

	// point value, pressure difference
	attribute float a_value;
	
	varying vec2 v_texcoord;
	varying float v_offset;
	
	void main() {
		// vec2 zeroToOne = (a_position) / (u_resolution);
		// vec2 zeroToTwo = zeroToOne * 2.0 - 1.0;

		gl_Position = a_position;

		v_texcoord = a_texcoord;
		v_offset = (a_value) / (u_max);
	}
`;

var rectangleFragmentShader = `precision mediump float;	

	// uniform float u_colorCount;
	uniform vec4 u_colorArr[500]; 
	uniform float u_offset[500];

	// float alpha = texture2D(u_framebuffer, v_texCoord.xy).a;
	varying vec2 v_texcoord;
	varying float v_offset;

	uniform vec3 tl;
	uniform vec3 tr;
	uniform vec3 bl;
	uniform vec3 br;

	float remap ( float minval, float maxval, float curval ) {
		return ( curval - minval ) / ( maxval - minval );
	}

	void main() {
		// int matchFound = 0;
		// if (v_offset > 0.0 && v_offset <= 1.0) {

		// 	if (v_offset <= u_offset[0]) {
		// 		tl = u_colorArr[0];
		// 		tr = u_colorArr[0];
		// 		bl = u_colorArr[0];
		// 		br = u_colorArr[0];
		// 		matchFound = 1;
		// 	}

		// 	for (int i=1; i<10; ++i) 
		// 	{
		// 		if (v_offset <= u_offset[i] && matchFound != 1) {
		// 			tl = mix( u_colorArr[i-1], u_colorArr[i], remap( u_offset[i-1], u_offset[i], v_offset ) );
		// 			tr = mix( u_colorArr[i-1], u_colorArr[i], remap( u_offset[i-1], u_offset[i], v_offset ) );
		// 			bl = mix( u_colorArr[i-1], u_colorArr[i], remap( u_offset[i-1], u_offset[i], v_offset ) );
		// 			br = mix( u_colorArr[i-1], u_colorArr[i], remap( u_offset[i-1], u_offset[i], v_offset ) );
		// 			matchFound = 1;
		// 		}
		// 	}
		// 	if (matchFound != 1) {
		// 		tl = vec4(0.0, 0.0, 0.0, 1.0);
		// 		tr = vec4(0.0, 0.0, 0.0, 1.0);
		// 		bl = vec4(0.0, 0.0, 0.0, 1.0);
		// 		br = vec4(0.0, 0.0, 0.0, 1.0);
		// 	}
		// }

		vec3 l = mix(bl, tl, v_texcoord.t);
		vec3 r = mix(br, tr, v_texcoord.t);
		vec3 c = mix(l, r, v_texcoord.s);
		gl_FragColor = vec4(c, 1);
		// gl_FragColor = vec4(0.78, 0.22, 0.22, 1);
	}
`;

/**
 * @typedef { Object } GradientColorPoint
 * @property { number[] } color - RGBA values array, e.g. [0, 0, 255, 1.0]
 * @property { number } offset - color position in gradient, ranges from 0.0 to 1.0
 */
/**
 * @typedef { Object } GradientPointsMap
 * @property { Float32Array } value - flattened array of normalized rgba values in range from 0 to 1
 * @property { number } length - normalized color points array length
 * @property { Float32Array } offset - array of color points offset values (from 0 to 1) 
 */

function Heatmap (containerElementSelector, config = {}) {
	// adapt newly passed coordinates to 
	// translate and zoom config values
	function translateAndZoomCoordinates (data) {
		// e.g. pixel ratio = 1, screen width = 800
		// 800 / ( 2 * 1 ) = 400
		const widFat = this.width / (2 * ratio);
		const heiFat = this.height / (2 * ratio);
		// 1650 - 400 = 1250
		data.x -= widFat;
		data.y -= heiFat;
		// 1250 / 400 = 3.125
		data.x /= widFat;
		data.y /= heiFat;
		// 3.125
		data.x = data.x * (this.zoom);
		data.y = data.y * (this.zoom);

		if (this.angle !== 0.0) {
			const c = Math.cos(this.angle);
			const s = Math.sin(this.angle);
			const x = data.x;
			const y = data.y;
			data.x = (c * x) + (-s * y);
			data.y = (s * x) + (c * y);
		}
		// 3.125 * 400 = 1250
		data.x *= widFat;
		data.y *= heiFat;
		// 1250 + 400 = 1650
		data.x += widFat;
		data.y += heiFat;
		data.x -= (this.translate[0]);
		data.y -= (this.translate[1]);
	}
	/**
	 * @description Forces rgb values into range from 0 to 1 and return gradient colors range data (individual offset and array length).
	 * @param { GradientColorPoint[] } gradientColorPointsArray
	 * @returns { GradientPointsMap } Gradient points data for Color Fragment shader
	 */
	function gradientMapper (gradientColorPointsArray) {
		const arr = [];
		const gradientColorPointsArrayLength = gradientColorPointsArray.length;
		const offSetsArray = [];

		gradientColorPointsArray.forEach(
			/**
			 * @description Forces rgb values into range from 0 to 1
			 * @param {GradientColorPoint} gradientPoint
			 */
			function (gradientPoint) {
				const red = gradientPoint.color[0];
				const green = gradientPoint.color[1];
				const blue = gradientPoint.color[2];
				const alpha = gradientPoint.color[3] === undefined ? 1.0 : gradientPoint.color[3];
				arr.push(red / 255);
				arr.push(green / 255);
				arr.push(blue / 255);
				arr.push(alpha);
				offSetsArray.push(gradientPoint.offset);
			});

		return {
			value: new Float32Array(arr), // flattened array of rgba values in range from 0 to 1
			length: gradientColorPointsArrayLength, // normalized color points array length
			offset: new Float32Array(offSetsArray) // array of color points offset values on gradient scale set manually in config (from 0 to 1)
		};
	}
	/**
	 * 
	 * @param { WebGLRenderingContext } ctx
	 * @param { 'VERTEX_SHADER' | 'FRAGMENT_SHADER' } shaderType
	 * @param { String } src - raw GLSL code for shader
	 */
	function createShader (ctx, shaderType, src) {
		var shader = ctx.createShader(ctx[shaderType]);
		if (shader === null) {
			throw new Error('unable to create shader');
		}
		ctx.shaderSource(shader, src);
		ctx.compileShader(shader);
		
		var compiled = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
		console.log(`COMPILATION STATUS (VALUE OF compiled): ${compiled}`);
		
		if (!compiled) {
			var lastError = ctx.getShaderInfoLog(shader);
			console.error("*** Error compiling shader. SHADER: ");
			console.error(shader);
			console.error("ERROR: ", lastError);
			ctx.deleteShader(shader);
			return null;
		}
		console.log('shader of type ', shaderType, 'compilation success');
		return shader;
	}
	/**
	 * Create the linked program object
	 * @param { WebGLRenderingContext } gl GL context
	 * @param {string} vshader a vertex shader program (string)
	 * @param {string} fshader a fragment shader program (string)
	 * @return created program object, or null if the creation has failed
	 */
	function createProgram(gl, vShaderSrc, fShaderSrc) {
		// Create shader object
		var vertexShader = createShader(gl, "VERTEX_SHADER", vShaderSrc);
		var fragmentShader = createShader(gl, "FRAGMENT_SHADER", fShaderSrc);

		if (!vertexShader || !fragmentShader) {
			console.error('One of the shaders creation failed');
			return null;
		}
		// Create a program object
		var program = gl.createProgram();
		if (!program) {
			console.error('Create program error');
			return null;
		}

		// Attach the shader objects
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);

		// Link the program object
		gl.linkProgram(program);

		// Check the result of linking
		var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
		if (!linked) {
			var error = gl.getProgramInfoLog(program);
			console.log('Failed to link program: ' + error);
			gl.deleteProgram(program);
			gl.deleteShader(fragmentShader);
			gl.deleteShader(vertexShader);
			return null;
		}
		return program;
	}

	function createGradientShader (ctx) {
		var vshader = createShader(ctx, 'VERTEX_SHADER', GradvertexShader);
		var fshader = createShader(ctx, 'FRAGMENT_SHADER', GradfragmentShader);
		
		const program = createProgram(ctx, vshader, fshader);

		return {
			program: program,
			attr: [{
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 2,
				attribute: ctx.getAttribLocation(program, 'a_position'),
				data: new Float32Array([])
			}, {
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 1,
				attribute: ctx.getAttribLocation(program, 'a_intensity'),
				data: new Float32Array([])
			}],
			uniform: {
				u_resolution: ctx.getUniformLocation(program, 'u_resolution'),
				u_max: ctx.getUniformLocation(program, 'u_max'),
				u_size: ctx.getUniformLocation(program, 'u_size'),
				u_blur: ctx.getUniformLocation(program, 'u_blur'),
				u_translate: ctx.getUniformLocation(program, 'u_translate'),
				u_zoom: ctx.getUniformLocation(program, 'u_zoom'),
				u_angle: ctx.getUniformLocation(program, 'u_angle'),
				u_density: ctx.getUniformLocation(program, 'u_density')
			}
		};
	}

	/**
	 * @param {WebGLRenderingContext} ctx 
	 */
	function createColorShader (ctx) {
		var vshader = createShader(ctx, 'VERTEX_SHADER', ColorvertexShader);
		var fshader = createShader(ctx, 'FRAGMENT_SHADER', ColorfragmentShader);
		var program = ctx.createProgram();
		ctx.attachShader(program, vshader);
		ctx.attachShader(program, fshader);
		ctx.linkProgram(program);

		var linked = ctx.getProgramParameter(program, ctx.LINK_STATUS);
		if (!linked) {
			var lastError = ctx.getProgramInfoLog(program);
			console.error('Error in program linking:' + lastError);
			ctx.deleteProgram(program);
		}

		return {
			program: program,
			attr: [{
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 2,
				attribute: ctx.getAttribLocation(program, 'a_texCoord'),
				data: new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0])
			}],
			uniform: {
				u_framebuffer: ctx.getUniformLocation(program, 'u_framebuffer'),
				u_colorArr: ctx.getUniformLocation(program, 'u_colorArr'),
				u_colorCount: ctx.getUniformLocation(program, 'u_colorCount'),
				u_opacity: ctx.getUniformLocation(program, 'u_opacity'),
				u_offset: ctx.getUniformLocation(program, 'u_offset')
			}
		};
	}

	/**
	 * @param {WebGLRenderingContext} ctx 
	 */
	function createRectangleShader (ctx) {
		const vShaderSource = rectangleVertexShader;
		const fShaderSource = rectangleFragmentShader;
		// var vshader = createShader(ctx, 'VERTEX_SHADER', VSHADER_SOURCE);
		// var fshader = createShader(ctx, 'FRAGMENT_SHADER', FSHADER_SOURCE);	
		const program = createProgram(ctx, vShaderSource, fShaderSource);
		if (!program) {
			console.error("createProgram function failed");
			return null
		}
		var linked = ctx.getProgramParameter(program, ctx.LINK_STATUS);
		if (!linked) {
			var lastError = ctx.getProgramInfoLog(program);
			console.error('Error in program linking:' + lastError);
			ctx.deleteProgram(program);
		}
		console.log('rectangle shader program linked.');
		return {
			program: program,
			attr: [{
				/* 
					[0] a_position
					[1] a_value
					[2] a_texcoord
				*/
				/* 
					this.rectangleShadOP.attr[0].data = exData.posVec;
					this.rectangleShadOP.attr[1].data = exData.rVec;
					this.rectangleShadOP.attr[2].data = exData.texcoord;
				*/

				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 2,
				attribute: ctx.getAttribLocation(program, 'a_position'),
				data: new Float32Array([])
			},
			{
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 1,
				attribute: ctx.getAttribLocation(program, 'a_value'),
				data: new Float32Array([])
			},
			{
				bufferType: ctx.ARRAY_BUFFER,
				buffer: ctx.createBuffer(),
				drawType: ctx.STATIC_DRAW,
				valueType: ctx.FLOAT,
				size: 2,
				attribute: ctx.getAttribLocation(program, 'a_texcoord'),
				data: new Float32Array([])
			}
			],
			uniform: {
				u_max: ctx.getUniformLocation(program, 'u_max'),
				u_colorArr: ctx.getUniformLocation(program, 'u_colorArr'),
				u_offset: ctx.getUniformLocation(program, 'u_offset'),
				u_resolution: ctx.getUniformLocation(program, 'u_resolution')
			}
		};
	}

	/** 
	 * Device pixel ratio
	 * @type { number }
	*/
	let ratio;
	/**
	 * Buffer for position vectors Float32Array
	 * @type { ArrayBuffer }
	 */
	let buffer;
	/**
	 * flattened xy vector (vec2) coordinates container [x, y, x1, y1, x2, y2 etc...]
	 * @type { Float32Array }
	 */
	let verticesArray = [];
	/**
	 * Buffer for radius vectors Float32Array
	 * @type { ArrayBuffer }
	 */
	let buffer2;
	/**
	 * Point radius vector (vec1) container [r1, r2, r3, etc...]
	 * @type { Float32Array }
	 */
	let radiusVectorsArray = [];
	
	let buffer3;
	let sizeVectorsArray = [];
	/** 
	 * point length?? TODO: Fix description
	 * @type { number }
	 */
	let pLen = 0;
	
	/**
	 * @typedef { Object } HeatmapDataPoint
	 * @property { number } x - x position on 2d plane
	 * @property { number } y - y position on 2d plane
	 * @property { number } value - current value for gradient calculation
	 */

	/**
	 * @typedef { Object } ExtractedData
	 * @property { Float32Array } posVec
	 * @property { Float32Array } rVec
	 */
	/**
	 * interpolates passed data points
	 * @param { HeatmapDataPoint[] } heatmapPoints 
	 * @returns { ExtractedData }
	 */
	function extractData (heatmapPoints) {
		const len = heatmapPoints.length;
		/* 
		// point
		{
			clipSpaceCoords:
			x: 0.05084745762711873
			y: -0.9333333333333333
			},
			scaleData: {
				x: 1550
				y: 1648097971712
			},
			sizeValues: {
				sizeX: 0.03389830508474567
				sizeY: 0.06666666666666665
			},
			value: 166
		}
		*/
		// const createRectangleCoords = (point) => {
		// };
		if (pLen !== len) {
			const rectangleVertices = 3;
			const pointValue = 1;
			buffer = new ArrayBuffer((len * Float32Array.BYTES_PER_ELEMENT) * (rectangleVertices + pointValue));
			verticesArray = new Float32Array(buffer);
			buffer2 = new ArrayBuffer(len * Float32Array.BYTES_PER_ELEMENT * 1);
			// point values
			radiusVectorsArray = new Float32Array(buffer2);
			buffer3 = new ArrayBuffer((len * Float32Array.BYTES_PER_ELEMENT) * 2);
			sizeVectorsArray = new Float32Array(buffer3);
			pLen = len;
		}
		
		for (let i = 0; i < len; i++) {
			const {x, y} = heatmapPoints[i].clipSpaceCoords;
			
			const leftX = x;
			const topY = y;
			const { sizeX, sizeY } = heatmapPoints[i].sizeValues;
			const halfSizeX = sizeX / 2;
			const halfSizeY = sizeY / 2;
			// console.log("x coord");
			// console.log(x);
			// console.log('sizeX');
			// console.log(sizeX);
		  // [x] -1, -1, 
			// [x]  1, -1, 
			// [x] -1,  1,
			// [x] -1,  1,
			// [x] 1, -1,
			// [x]	1,  1,
			const bottomLeft = {
				x: leftX,
				y: topY - sizeY
				// y: topY - (halfSizeY * 2)
			};
			const bottomRight = {
				x: leftX + sizeX,
				y: topY - sizeY
				// y: topY - (halfSizeY * 2)
			};
			const topLeft = {
				x: leftX,
				y: topY
			};
			const topRight = {
				x: leftX + sizeX,
				y: topY
			};
			
			// console.log('top right');
			// console.log(topRight);
			// console.log('top left');
			// console.log(topLeft);
			// console.log('bottom right');
			// console.log(bottomRight);
			// console.log('bottom left');
			// console.log(bottomLeft);

			// top left
			verticesArray[i * 9] = topLeft.x;
			verticesArray[(i * 9) + 1] = topLeft.y;
			// bottom left
			verticesArray[(i * 9) + 2] = bottomLeft.x;
			verticesArray[(i * 9) + 3] = bottomLeft.y;
			// bottom right
			verticesArray[(i * 9) + 4] = bottomRight.x;
			verticesArray[(i * 9) + 5] = bottomRight.y;
			// top right
			verticesArray[(i * 9) + 6] = topRight.x;
			verticesArray[(i * 9) + 7] = topRight.y;
			// value
			verticesArray[(i * 9) + 8] = heatmapPoints[i].value;
			// point value
			radiusVectorsArray[i] = heatmapPoints[i].value;
			// horizontal and vertical rectangle size
			sizeVectorsArray[i * 2] = sizeX;
			sizeVectorsArray[(i * 2) + 1] = sizeY;
		}
		// console.log(positionVectorsArray);
		// console.log('positionVectorsArray');
		// console.log('heatmap points');
		// console.log(heatmapPoints);
		// console.log('test pos vec');
		// console.log(testPosVecArr)
		return {
			vertices: verticesArray,
			// posVec: positionVectorsArray,
			rVec: radiusVectorsArray,
			sizeVec: sizeVectorsArray
		};
	};

	function Chart (containerElementSelector, config) {
		const containerHTMLElement = document.querySelector(containerElementSelector);
		const height = containerHTMLElement.clientHeight;
		const width = containerHTMLElement.clientWidth;
		// --
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl', {
			premultipliedAlpha: false,
			depth: false,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: false
		});
		ratio = getPixelRatio(gl);
		// -- set canvas DOM element width and height
		canvas.setAttribute('height', height * ratio);
		canvas.setAttribute('width', width * ratio);
		canvas.style.height = `${height}px`;
		canvas.style.width = `${width}px`;
		canvas.style.position = 'absolute';
		containerHTMLElement.appendChild(canvas);
		// --
		this.width = width * ratio;
		this.height = height * ratio;
		this.containerHTMLElement = containerHTMLElement;
		this.canvas = canvas;
		// -- webgl setup
		this.type = config.type;
		gl.clearColor(0, 0, 0, 0);

		this.ctx = gl;
		this.gradient = gradientMapper(config.gradient);
		if (this.type === CIRCLE_HEATMAP) {
			console.log(`heatmap type is: ${this.type}`);
			gl.enable(gl.BLEND); // Activates blending of the computed fragment color values
			// blendEquation();
			// specifying how source and destination colors are combined. gl.FUNC_ADD: source + destination
			gl.blendEquation(gl.FUNC_ADD);
			// blendFunc()
			// method of the WebGL API defines which function is used for blending pixel arithmetic
			// gl.ONE - 1,1,1,1	Multiplies all colors by 1
			// gl.ONE_MINUS_SRC_ALPHA	1-AS, 1-AS, 1-AS, 1-AS	Multiplies all colors by 1 minus the source alpha value.
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.depthMask(true);

			this.gradShadOP = createGradientShader(this.ctx);
			this.colorShadOP = createColorShader(this.ctx);
			// TODO: Possibly from if clauses
			this.frameBufferTextureObject = gl.createTexture();
			this.frameBufferObject = gl.createFramebuffer();
		}
		if (this.type === HORIZONTAL_HEATMAP) {
			try {
				console.log(`heatmap type is: ${this.type}`);
				
				this.rectangleShadOP = createRectangleShader(this.ctx);
				if (this.rectangleShadOP === null) {
					throw new Error("rectangle shader object creation failed");
				}
			}catch(e) {
				console.error(e);
			}
			
		}
		
		this.size = config.size ? config.size : 20.0;
		this.max = config.max ? config.max : Infinity;
		this.blur = config.blur ? config.blur : 1.0;
		this.translate = (config.translate && config.translate.length === 2) ? config.translate : [0, 0];
		this.zoom = (config.zoom ? config.zoom : 1.0);
		this.angle = (config.rotationAngle ? config.rotationAngle : 0.0);
		this.opacity = config.opacity ? config.opacity : 1.0;
		this.ratio = ratio;

		this.rawData = [];

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	}

	Chart.prototype.resize = function () {
		const height = this.containerHTMLElement.clientHeight;
		const width = this.containerHTMLElement.clientWidth;
		this.canvas.setAttribute('height', height * ratio);
		this.canvas.setAttribute('width', width * ratio);
		this.canvas.style.height = `${height}px`;
		this.canvas.style.width = `${width}px`;
		this.width = width * ratio;
		this.height = height * ratio;
		this.ctx.viewport(0, 0, this.width, this.height);

		/* Perform update */
		this.render(this.exData);
	};

	Chart.prototype.clear = function () {
		this.ctx.clear(this.ctx.COLOR_BUFFER_BIT | this.ctx.DEPTH_BUFFER_BIT);
	};

	Chart.prototype.setMax = function (max) {
		checkNumberParameter(max);
		this.max = max;
		this.render(this.exData);
	};

	Chart.prototype.setTranslate = function (translate) {
		if (Array.isArray(translate) && translate.length === 2 && translate.every((value) => typeof value === 'number')) {
			 this.translate = translate;
		} else {
			throw new TypeError('Wrong parameter value, must be an array with two numbers');
		}
		this.render(this.exData);
	};

	Chart.prototype.setZoom = function (zoom) {
		checkNumberParameter(zoom);
		this.zoom = zoom;
		this.render(this.exData);
	};

	Chart.prototype.setRotationAngle = function (angle) {
		checkNumberParameter(angle);
		this.angle = angle;
		this.render(this.exData);
	};

	Chart.prototype.setSize = function (size) {
		checkNumberParameter(size);
		this.size = size;
		this.render(this.exData);
	};

	Chart.prototype.setBlur = function (blur) {
		checkNumberParameter(blur);
		this.blur = blur;
		this.render(this.exData);
	};

	Chart.prototype.setOpacity = function (opacity) {
		checkNumberParameter(opacity);
		this.opacity = opacity !== undefined ? opacity : 1.0;
		this.render(this.exData);
	};
  
	/**
	 * 
	 * @param {  } data 
	 * @param { boolean } transIntactFlag 
	 */
	Chart.prototype.addData = function (data, transIntactFlag) {
		const self = this;
		for (let i = 0; i < data.length; i++) {
			if (transIntactFlag) {
				translateAndZoomCoordinates.call(self, data[i]);
			}
			this.rawData.push(data[i]);
		}
		this.renderData(this.rawData);
	};

	Chart.prototype.renderData = function (data) {
		// console.log('render data log');
		// console.log('raw data');
		// console.log(data);
		const exData = extractData(data);
		// console.log('extractedData: ');
		// console.log(exData);
		this.rawData = data;
		this.render(exData);
	};

	Chart.prototype.render = function (exData) {
		const ctx = this.ctx;
		// posVec & rVec
		this.exData = exData;
		ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
		if (this.type === HORIZONTAL_HEATMAP) {
			/* 
					[0] a_position
					[1] a_value
					[2] a_offset
				*/
			/* 
					this.rectangleShadOP.attr[0].data = exData.posVec;
					this.rectangleShadOP.attr[1].data = exData.rVec;
					this.rectangleShadOP.attr[2].data = exData.offset;
				*/
				// console.log('extracted pos vec data');
				// console.log(exData.posVec);
				// console.log("posVec FUCKING ARRAY");
				// console.log(exData.posVec);
			this.rectangleShadOP.attr[0].data = exData.posVec;
			this.rectangleShadOP.attr[1].data = exData.rVec;
			// texcoord
			this.rectangleShadOP.attr[2].data = new Float32Array([
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
				0, 0,
				1, 0,
				0, 1,
				0, 1,
				1, 0,
				1, 1,
		 ]);

		//  console.log('gradient data length');
		//  console.log(this.rectangleShadOP.attr[2].data.length);
		 	ctx.useProgram(this.rectangleShadOP.program);
			// ctx.uniform1f(this.rectangleShadOP.uniform.u_colorCount, this.gradient.length);

			// this.rectangleShadOP.attr.forEach((d, idx) => {
			// 	const normalized = this.ctx.FALSE;
			// 	/* 
			// 		[0] a_position
			// 		[1] a_value
			// 		[2] a_texcoord
			// 	*/
			// 	// if (idx === 0) console.log('a_position log');
			// 	// if (idx === 1) console.log('a_value log');
			// 	// if (idx === 2) console.log('a_texcoord log');
			// 	// console.log('data');
			// 	// console.log(d.data);
				
				
			// 	ctx.bindBuffer(d.bufferType, d.buffer);
			// 	ctx.bufferData(d.bufferType, d.data, d.drawType);
			// 	ctx.vertexAttribPointer(d.attribute, d.size, d.valueType, normalized, 0, 0);
			// 	ctx.enableVertexAttribArray(d.attribute);
			// });
		 // old code END
		//  [0] a_position
		//  [1] a_value
		//  [2] a_texcoord
		// Get the storage location of a_Position, assign and enable buffer
		 var FSIZE = Float32Array.BYTES_PER_ELEMENT;
		 var rectVertexBuffer = ctx.createBuffer();  
		 if (!rectVertexBuffer) {
			 console.log('Failed to create the rectVertexBuffer object');
			 return false;
		 }
		 // Write the vertex coordinates and colors to the buffer object
		 console.log("INPUT DATA");
		 console.log(exData.vertices);
		 ctx.bindBuffer(ctx.ARRAY_BUFFER, rectVertexBuffer);
		 ctx.bufferData(ctx.ARRAY_BUFFER, exData.vertices, ctx.STATIC_DRAW);
		
		 var a_Position = ctx.getAttribLocation(this.rectangleShadOP.program, 'a_position');
		 if (a_Position < 0) {
			 console.log('Failed to get the storage location of a_Position');
			 return -1;
		 }
		 ctx.vertexAttribPointer(a_Position, 2, ctx.FLOAT, false, FSIZE * 3, 0);
		 ctx.enableVertexAttribArray(a_Position);
	 
		 // Get the storage location of a_Position, assign buffer and enable
		 var a_value = ctx.getAttribLocation(this.rectangleShadOP.program, 'a_value');
		 if(a_value < 0) {
			 console.log('Failed to get the storage location of a_Color');
			 return -1;
		 }
		 ctx.vertexAttribPointer(a_value, 1, ctx.FLOAT, false, FSIZE * 3, FSIZE * 2);
		 ctx.enableVertexAttribArray(a_value);

			var n = 4 * 30; // The number of vertices

			const tl = [254/255, 217/255, 138/255];
			const tr = [252/255, 252/255, 252/255];
			const bl = [18/255, 139/255, 184/255];
			const br = [203/255,  79/255, 121/255];

			const tlLoc = ctx.getUniformLocation(this.rectangleShadOP.program, 'tl');
			const trLoc = ctx.getUniformLocation(this.rectangleShadOP.program, 'tr');
			const blLoc = ctx.getUniformLocation(this.rectangleShadOP.program, 'bl');
			const brLoc = ctx.getUniformLocation(this.rectangleShadOP.program, 'br');

			ctx.uniform3fv(tlLoc, tl);
			ctx.uniform3fv(trLoc, tr);
			ctx.uniform3fv(blLoc, bl);
			ctx.uniform3fv(brLoc, br);
			
			ctx.uniform2fv(this.rectangleShadOP.uniform.u_resolution, new Float32Array([this.width, this.height]));

			ctx.uniform4fv(this.rectangleShadOP.uniform.u_colorArr, this.gradient.value);
			// console.log("GRADIENT VALUE");
			// console.log(this.gradient.value);

			ctx.uniform1fv(this.rectangleShadOP.uniform.u_offset, this.gradient.offset);
			// console.log("GRADIENT OFFSET");
			// console.log(this.gradient.offset)

			ctx.uniform1f(this.rectangleShadOP.uniform.u_max, this.max);
			
			ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 22);
			// ---- 
		} else if (this.type === CIRCLE_HEATMAP) {
			this.gradShadOP.attr[0].data = exData.posVec;
			this.gradShadOP.attr[1].data = exData.rVec;
			
			ctx.useProgram(this.gradShadOP.program);

			ctx.uniform2fv(this.gradShadOP.uniform.u_resolution, new Float32Array([this.width, this.height]));
			ctx.uniform2fv(this.gradShadOP.uniform.u_translate, new Float32Array([this.translate[0], this.translate[1]]));
			ctx.uniform1f(this.gradShadOP.uniform.u_zoom, this.zoom ? this.zoom : 0.01);
			ctx.uniform1f(this.gradShadOP.uniform.u_angle, this.angle);
			ctx.uniform1f(this.gradShadOP.uniform.u_density, this.ratio);
			ctx.uniform1f(this.gradShadOP.uniform.u_max, this.maxValue);
			ctx.uniform1f(this.gradShadOP.uniform.u_size, this.size);
			ctx.uniform1f(this.gradShadOP.uniform.u_blur, this.blur);
			
			this.gradShadOP.attr.forEach(function (d) {
				ctx.bindBuffer(d.bufferType, d.buffer);
				ctx.bufferData(d.bufferType, d.data, d.drawType);
				ctx.enableVertexAttribArray(d.attribute);
				ctx.vertexAttribPointer(d.attribute, d.size, d.valueType, true, 0, 0);
			});

			ctx.bindTexture(ctx.TEXTURE_2D, this.frameBufferTextureObject);
			ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, this.width, this.height, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, null);
			ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
			ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
			ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);

			ctx.bindFramebuffer(ctx.FRAMEBUFFER, this.frameBufferObject);
			ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, this.frameBufferTextureObject, 0);

			ctx.drawArrays(ctx.POINTS, 0, exData.posVec.length / 2);
			ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
			ctx.useProgram(this.colorShadOP.program);

			ctx.uniform4fv(this.colorShadOP.uniform.u_colorArr, this.gradient.value);
			ctx.uniform1f(this.colorShadOP.uniform.u_colorCount, this.gradient.length);
			ctx.uniform1fv(this.colorShadOP.uniform.u_offset, this.gradient.offset);
			ctx.uniform1f(this.colorShadOP.uniform.u_opacity, this.opacity);

			this.colorShadOP.attr.forEach(function (d) {
				ctx.bindBuffer(d.bufferType, d.buffer);
				ctx.bufferData(d.bufferType, d.data, d.drawType);
				ctx.enableVertexAttribArray(d.attribute);
				ctx.vertexAttribPointer(d.attribute, d.size, d.valueType, true, 0, 0);
			});

			ctx.uniform1i(this.colorShadOP.uniform.u_framebuffer, 0);
			ctx.activeTexture(ctx.TEXTURE0);
			ctx.bindTexture(ctx.TEXTURE_2D, this.frameBufferTextureObject);

			ctx.drawArrays(ctx.TRIANGLES, 0, 6);
		} else {
			throw new SyntaxError('Heatmap type not recognized, existing types are: "horizontal", "circle"')
		}
	};

	return new Chart(containerElementSelector, config);
}

export default Heatmap;
