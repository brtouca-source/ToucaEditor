'use strict';
// Only a new, content-free draft is disposable. Clearing an existing project is a real edit.
function shouldPersistProject(project,alreadySaved=false){
 if(!project||!Array.isArray(project.assets)||!Array.isArray(project.clips))throw Error('Projeto inválido: mídia/timeline ausente.');
 return alreadySaved||project.assets.length>0||project.clips.length>0;
}
module.exports={shouldPersistProject};
