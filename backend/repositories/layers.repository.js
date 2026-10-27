const d = require('../infrastructure/atlasDocuments');
const ApiError = require('../utils/ApiError');
const IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/i;

function assertSafeIdentifier(value, label) {
  if (!value || !IDENTIFIER_REGEX.test(value)) {
    throw new ApiError(500, `${label} inválido en configuración de capa.`);
  }
}

function parseBbox(bbox) {
  if (!bbox) return null;
  const parts = String(bbox).split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
    throw new ApiError(400, 'bbox debe tener formato minLng,minLat,maxLng,maxLat.');
  }

  return parts;
}

function geometryIntersectsBbox(geometry, bbox) {
  if (!bbox) return true;
  const coordinates = [];
  const visit = (value) => {
    if (Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite)) coordinates.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry?.coordinates);
  if (!coordinates.length) return false;
  const xs = coordinates.map((point) => point[0]);
  const ys = coordinates.map((point) => point[1]);
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return Math.max(...xs) >= minLng && Math.min(...xs) <= maxLng
    && Math.max(...ys) >= minLat && Math.min(...ys) <= maxLat;
}


const access=(org,role)=>({status:'active',allowed_roles:role,$or:[d.org(org),{organization_id:null}]});
const listLayers=(org,role)=>d.find('layer_catalog',access(org,role),{category:1,name:1});
async function getLayerById(id,org,role){const row=d.required(await d.one('layer_catalog',{...access(org,role),...(/^\d+$/.test(String(id))?{layer_id:Number(id)}:{slug:id})}));return {...row,request_organization_id:d.org(org).organization_id};}
async function getLayerFeatures(layer,{bbox,limit=500,offset=0}={}){
 const name=layer.source_collection||layer.source_table;assertSafeIdentifier(name,'source_collection');assertSafeIdentifier(layer.geom_column,'geom_column');
 const parsed=parseBbox(bbox),scope=d.org(layer.request_organization_id||layer.organization_id);const rows=await d.find(name,{...scope,[layer.geom_column]:{$ne:null}});
 const features=rows.filter(row=>geometryIntersectsBbox(row[layer.geom_column],parsed)).slice(Math.max(0,Number(offset)||0),Math.max(0,Number(offset)||0)+Math.min(1000,Math.max(1,Number(limit)||500))).map(row=>{const {[layer.geom_column]:geometry,...properties}=row;return {type:'Feature',geometry,properties};});
 return {type:'FeatureCollection',features};
}
module.exports={listLayers,getLayerById,getLayerFeatures,parseBbox,geometryIntersectsBbox};
