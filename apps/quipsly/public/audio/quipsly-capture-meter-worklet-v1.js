const CLIPPING_AMPLITUDE = 0.999;
const QUANTA_PER_MESSAGE = 16;

class QuipslyCaptureMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sequence = 0;
    this.resetAggregate();
    this.port.onmessage = (event) => {
      if (event.data?.kind !== "quipsly-capture-meter-flush-v1") return;
      this.emitAggregate();
      this.port.postMessage({ kind: "quipsly-capture-meter-flushed-v1" });
    };
  }

  resetAggregate() {
    this.renderQuantumCount = 0;
    this.analysisChannelCount = 0;
    this.sampleCount = 0;
    this.sumSquares = 0;
    this.peakAmplitude = 0;
    this.nearFullScaleSampleCount = 0;
  }

  emitAggregate() {
    if (this.renderQuantumCount === 0) return;
    this.port.postMessage({
      kind: "quipsly-capture-meter-aggregate-v1",
      sequence: this.sequence,
      renderQuantumCount: this.renderQuantumCount,
      analysisChannelCount: this.analysisChannelCount,
      sampleCount: this.sampleCount,
      sumSquares: this.sumSquares,
      peakAmplitude: this.peakAmplitude,
      nearFullScaleSampleCount: this.nearFullScaleSampleCount,
    });
    this.sequence += 1;
    this.resetAggregate();
  }

  process(inputs) {
    const channels = inputs[0] || [];
    if (channels.length > 0) this.renderQuantumCount += 1;
    this.analysisChannelCount = Math.max(this.analysisChannelCount, channels.length);

    for (const channel of channels) {
      for (let index = 0; index < channel.length; index += 1) {
        const sample = Number.isFinite(channel[index])
          ? Math.max(-1, Math.min(1, channel[index]))
          : 0;
        const amplitude = Math.abs(sample);
        this.sumSquares += sample * sample;
        this.peakAmplitude = Math.max(this.peakAmplitude, amplitude);
        if (amplitude >= CLIPPING_AMPLITUDE) this.nearFullScaleSampleCount += 1;
      }
      this.sampleCount += channel.length;
    }

    if (this.renderQuantumCount >= QUANTA_PER_MESSAGE) {
      this.emitAggregate();
    }
    return true;
  }
}

registerProcessor("quipsly-capture-meter-v1", QuipslyCaptureMeterProcessor);
