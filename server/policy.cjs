const { textField, imageField, enumField } = require('./ai-guard.cjs');
const policy = { scope: 'art-generate', perMinute: 12, perDay: 200, concurrent: 2, maxBodyBytes: 4 * 1024 * 1024,
  validate(body) {
    enumField(body, 'mode', ['txt2img', 'img2img']); textField(body, 'prompt', 2000); textField(body, 'stylePrompt', 2000);
    imageField(body, 'imageDataUrl', body.mode === 'img2img');
    enumField(body, 'quality', ['fast', 'low', 'medium', 'high']);
    enumField(body, 'size', ['512x512', '1024x1024', '1024x1536', '1536x1024']);
  }
};
module.exports = { policy };
