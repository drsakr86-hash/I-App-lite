// The atlas plates, in display order. Each plate is plain data (see model.js validatePlate for the contract).
import generalEye from './general-eye.js';
import retinaLayers from './retina-layers.js';
import vitreoretinalInterface from './vitreoretinal-interface.js';
import extraocularMuscles from './extraocular-muscles.js';
import visualPathway from './visual-pathway.js';
import anteriorSegmentAngle from './anterior-segment-angle.js';
import lensPupil from './lens-pupil.js';
import imagePlates from './image-plates.js';
import eyeCharts from './eye-charts.js';
import blankCanvas from './blank.js';

export const PLATES = Object.freeze([generalEye, retinaLayers, vitreoretinalInterface, extraocularMuscles, visualPathway, anteriorSegmentAngle, lensPupil, ...imagePlates, ...eyeCharts, blankCanvas]);
