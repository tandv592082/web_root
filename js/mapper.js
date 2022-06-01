import * as THREE from './3rd_party/three.module.js';
import { TrackballControls } from './3rd_party/TrackballControls.js';

// global elements
let perspectiveCamera, controls, scene, renderer, line_x, line_y, line_z, points, m_mesh, m_costmap, plan_pt;

// modes
const modes = {
    COSTMAP: 0,
    MESH: 1,
    SAT: 2
}

let curr_mode = modes.COSTMAP;

// conditional flags
var r_pose = false;
var r_ptcloud = false;
var r_paths = false;
var r_mesh = false;
var r_costmap = true;

var cam_update = true;
var first_pose = true;
var first_pts = true;
var new_mesh = true;
var first_cost = true;

var click_plan = false;

let points_, pt_curveObject;
var first_rrt = true;

// camera setup
const fov = 50;
const aspect = window.innerWidth / window.innerHeight;
const near = 0.25;
const far = 100;
perspectiveCamera = new THREE.PerspectiveCamera( fov, aspect, near, far );
perspectiveCamera.position.z = 50;

// scene setup
scene = new THREE.Scene();
scene.background = new THREE.Color( 0xcccccc );

var grid = new THREE.GridHelper(25, 100);
grid.geometry.rotateX( Math.PI / 2 );

scene.add(grid);

const light = new THREE.HemisphereLight();
scene.add( light );

// renderer setup
renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
var canvas = renderer.domElement;

document.body.appendChild( renderer.domElement );

window.addEventListener( 'resize', onWindowResize );

createControls( perspectiveCamera );

animate();

//////////////////////////////////////////////////////////
// Open up our websockets
//////////////////////////////////////////////////////////
var url = window.location.href;
var url_partial = url.split("/");
console.log(url_partial[2]);

var costmap_ws = new WebSocket("ws://" + url_partial[2] + ":80/costmap");
costmap_ws.binaryType = "arraybuffer";

var pose_ws = new WebSocket("ws://" + url_partial[2] + ":80/pose");
pose_ws.binaryType = "arraybuffer";

var mesh_ws = new WebSocket("ws://" + url_partial[2] + ":80/mesh");
mesh_ws.binaryType = "arraybuffer";

var plan_ws = new WebSocket("ws://" + url_partial[2] + ":80/plan");
plan_ws.binaryType = "arraybuffer";

var ptcloud_ws = new WebSocket("ws://" + url_partial[2] + ":80/aligned_ptcloud");
ptcloud_ws.binaryType = "arraybuffer";

//////////////////////////////////////////////////////////
// Websocket functions
//////////////////////////////////////////////////////////

mesh_ws.onopen = function() {
    console.log("[INFO] Mesh websocket open");
};

mesh_ws.onmessage = function (evt) {
    if (r_mesh){
        var received_msg = evt.data;

        var parser = new jParser(received_msg, {
            mesh_metadata_t: {
                magic_number: 'uint32',
                timestamp_ns: ['array', 'uint32', 2],
                size_bytes: ['array', 'uint32', 2],
                num_vertices: 'uint32',
                reserved: ['array', 'uint32', 10]
            },
            mesh_vertex_t: {
                x: 'float32',
                y: 'float32',
                z: 'float32',
                r: 'uint8',
                g: 'uint8',
                b: 'uint8',
                normal_x: 'float32',
                normal_y: 'float32',
                normal_z: 'float32',
                index_x: 'uint16',
                index_y: 'uint16',
                index_z: 'uint16'
            }
        });

        var mesh_metadata = parser.parse('mesh_metadata_t');

        // mesh attributes
        const m_vertices = [];
        const m_normals = [];
        const m_colors = [];

        for (var k = 0; k < mesh_metadata.num_vertices; k++){
            var mesh_vertex = parser.parse('mesh_vertex_t');

            m_vertices.push(mesh_vertex.x, mesh_vertex.y, mesh_vertex.z);
            m_colors.push(mesh_vertex.r/255.0, mesh_vertex.g/255.0, mesh_vertex.b/255.0);
            m_normals.push(mesh_vertex.normal_x, mesh_vertex.normal_y, mesh_vertex.normal_z);
        }

        const NumComponents = 3;

        if (new_mesh){
            perspectiveCamera.position.x = m_vertices[0];
            perspectiveCamera.position.y = m_vertices[1];
            perspectiveCamera.position.z = m_vertices[2] - 10;
            new_mesh = false;
            const m_geometry = new THREE.BufferGeometry();
            m_geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( m_vertices, NumComponents ) );
            m_geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( m_normals, NumComponents ) );
            m_geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( m_colors, NumComponents ) );
            const material = new THREE.MeshPhongMaterial( {
                side: THREE.DoubleSide,
                vertexColors: true
            } );

            m_mesh = new THREE.Mesh( m_geometry, material );
        }
        else {
            const positions = m_mesh.geometry.attributes.position.array;
            const conc_positions = m_vertices.concat(positions);

            const normals = m_mesh.geometry.attributes.normal.array;
            const conc_normals = m_normals.concat(normals);

            const colors = m_mesh.geometry.attributes.color.array;
            const conc_colors = m_colors.concat(colors);

            m_mesh.geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( conc_positions, NumComponents ) );
            m_mesh.geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( conc_normals, NumComponents ) );
            m_mesh.geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( conc_colors, NumComponents ) );
        }
        // required after the first render
        m_mesh.geometry.buffersNeedUpdate = true;
        m_mesh.geometry.attributes.position.needsUpdate = true;
        m_mesh.geometry.attributes.color.needsUpdate = true;
        m_mesh.geometry.attributes.normal.needsUpdate = true;

        scene.add( m_mesh );
    }
    else {
        scene.remove(m_mesh);
        new_mesh = true;
    }
}

mesh_ws.onclose = function() {
    console.log("[INFO] Mesh websocket closed");
};

pose_ws.onopen = function() {
    console.log("[INFO] Pose websocket open");
}

pose_ws.onmessage = function (evt) {
    scene.remove(line_x);
    scene.remove(line_y);
    scene.remove(line_z);

    if (r_pose){
        var received_msg = evt.data;
        var parser = new jParser(received_msg, {
            pose_6dof_t: {
                magic_number: 'uint32',
                timestamp_ns: 'uint64',
                T_child_wrt_parent: ['array', 'float32', 3],
                R_child_to_parent: ['array', 'float32', 9],
	            v_child_wrt_parent: ['array', 'float32', 3],
	            w_child_wrt_child: ['array', 'float32', 3]
            }
        });

        var pose = parser.parse('pose_6dof_t');

        const blue_material = new THREE.LineBasicMaterial( { color: 0x0000ff, linewidth: 5     } );
        const green_material = new THREE.LineBasicMaterial( { color: 0x00ff00, linewidth: 5    } );
        const red_material = new THREE.LineBasicMaterial( { color: 0xff0000, linewidth: 5      } );

        const p_x = [];
        const p_y = [];
        const p_z = [];

        p_x.push( new THREE.Vector3( 0,       0,       0));
        p_y.push( new THREE.Vector3( 0,       0,       0));
        p_z.push( new THREE.Vector3( 0,       0,       0));
        p_x.push( new THREE.Vector3( 0+0.125, 0,       0));
        p_y.push( new THREE.Vector3( 0,       0+0.125, 0));
        p_z.push( new THREE.Vector3( 0,       0,       0+0.125));

        const geometry_x = new THREE.BufferGeometry().setFromPoints( p_x );
        const geometry_y = new THREE.BufferGeometry().setFromPoints( p_y );
        const geometry_z = new THREE.BufferGeometry().setFromPoints( p_z );

        var m = new THREE.Matrix4();
        m.set(  pose.R_child_to_parent[0], pose.R_child_to_parent[1], pose.R_child_to_parent[2], pose.T_child_wrt_parent[0],
                pose.R_child_to_parent[3], pose.R_child_to_parent[4], pose.R_child_to_parent[5], pose.T_child_wrt_parent[1],
                pose.R_child_to_parent[6], pose.R_child_to_parent[7], pose.R_child_to_parent[8], pose.T_child_wrt_parent[2],
                0,                         0,                         0,                         1);

        geometry_x.applyMatrix4(m);
        geometry_y.applyMatrix4(m);
        geometry_z.applyMatrix4(m);

        if (!first_pose){
            scene.remove(line_x);
            scene.remove(line_y);
            scene.remove(line_z);
        }
        else {
            first_pose = false;
        }

        line_x = new THREE.Line( geometry_x, red_material );
        line_y = new THREE.Line( geometry_y, green_material );
        line_z = new THREE.Line( geometry_z, blue_material );

        scene.add(line_x);
        scene.add(line_y);
        scene.add(line_z);

        animate();
    }
}

pose_ws.onclose = function() {
    console.log("[INFO] Pose websocket closed");
}

plan_ws.onopen = function() {
    console.log("[INFO] Plan websocket open");
};

plan_ws.onmessage = function (evt) {
    if (r_paths){
        var received_msg = evt.data;

        var parser = new jParser(received_msg, {
            ptcloud_metadata_t: {
                magic_number: 'uint32',
                timestamp_ns: ['array', 'uint32', 2],
                n_points: 'uint32',
                format: 'uint32'
            },
            point_data: {
                x: 'float32',
                y: 'float32',
                z: 'float32'
            }
        });

        var ptcloud_meta = parser.parse('ptcloud_metadata_t');

        // ptcloud attributes
        const points = [];
        console.log(points);

        for (var i = 0; i < ptcloud_meta.n_points; i++){
            var curr_point = parser.parse('point_data');
            points.push(new THREE.Vector3(curr_point.x, curr_point.y, curr_point.z));
        }

        if (ptcloud_meta.format == 6){
            if (first_rrt){
                var temp_geometry = new THREE.BufferGeometry().setFromPoints(points);
                var temp_material = new THREE.PointsMaterial( { size: 0.2, color: 0x000000, vertexColors: false } );
                points_ = new THREE.Points( temp_geometry, temp_material );
            }
            else {
                points_.geometry.setFromPoints(points);
                points_.geometry.buffersNeedUpdate = true;
                points_.geometry.attributes.position.needsUpdate = true;
            }
            scene.add(points_);
        }

        const pt_curve = new THREE.CatmullRomCurve3(points);
        var curvy_points = pt_curve.getPoints( ptcloud_meta.n_points );

        var pt_geometry = new THREE.BufferGeometry().setFromPoints( curvy_points );
        let pt_material;

        if (ptcloud_meta.format == 0){
            pt_geometry = new THREE.BufferGeometry().setFromPoints( points );
            pt_material = new THREE.LineBasicMaterial( { color : 0xff0000, linewidth: 5 } );
        }
        else if (ptcloud_meta.format == 1){
            pt_material = new THREE.LineBasicMaterial( { color : 0x00ff00, linewidth: 5 } );
        }
        else if (ptcloud_meta.format == 2) {
            pt_material = new THREE.LineBasicMaterial( { color : 0x0000ff, linewidth: 5 } );
        }
        else if (ptcloud_meta.format == 6) {
            pt_geometry = new THREE.BufferGeometry().setFromPoints( points );
            pt_material = new THREE.LineBasicMaterial( { color : 0x008000, linewidth: 5 } );
        }
        else {
            pt_material = new THREE.LineBasicMaterial( { color : 0xff007f, linewidth: 5 } );
        }

        if (first_rrt && ptcloud_meta.format == 6){
            first_rrt = false;
            pt_curveObject = new THREE.LineSegments( pt_geometry, pt_material );
            scene.add( pt_curveObject );
        }
        else if (!first_rrt && ptcloud_meta.format == 6) {
            pt_curveObject.geometry.setFromPoints(points);
            pt_curveObject.geometry.buffersNeedUpdate = true;
            pt_curveObject.geometry.attributes.position.needsUpdate = true;
            scene.add( pt_curveObject );
        }
        else {
            var path_ = new THREE.Line( pt_geometry, pt_material );
            scene.add(path_);
        }

        animate();

        // now would need to render in the planning buttons
        if (ptcloud_meta.format != 4) showPathOptions();
    }
}

plan_ws.onclose = function() {
    console.log("[INFO] Plan websocket closed");
};


ptcloud_ws.onopen = function() {
    console.log("[INFO] Aligned Ptcloud websocket open");
};

ptcloud_ws.onmessage = function(evt) {
    if (r_ptcloud){
        var received_msg = evt.data;

        var parser = new jParser(received_msg, {
            ptcloud_metadata_t: {
                magic_number: 'uint32',
                timestamp_ns: ['array', 'uint32', 2],
                n_points: 'uint32',
                format: 'uint32'
            },
            point_data: {
                x: 'float32',
                y: 'float32',
                z: 'float32'
            }
        });

        var ptcloud_meta = parser.parse('ptcloud_metadata_t');

        // ptcloud attributes
        var positions = [];

        for (var i = 0; i < ptcloud_meta.n_points; i++){
            var curr_point = parser.parse('point_data');
            positions.push(curr_point.x, curr_point.y, curr_point.z);
        }

        if (first_pts){
            first_pts = false;
            var pt_geometry = new THREE.BufferGeometry();
            pt_geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );

            var material = new THREE.PointsMaterial( { size: 0.2, color: 0x000000, vertexColors: false } );

            points = new THREE.Points( pt_geometry, material );
        }
        else {
            const _positions = points.geometry.attributes.position.array;
            const conc_positions = positions.concat(_positions);

            points.geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( conc_positions, 3 ) );
        }
        // required after the first render
        points.geometry.buffersNeedUpdate = true;
        points.geometry.attributes.position.needsUpdate = true;

        scene.add( points );
    }
    else {
        scene.remove(points);
    }
}

ptcloud_ws.onclose = function() {
    console.log("[INFO] Aligned Ptcloud websocket closed");
}

costmap_ws.onopen = function() {
    console.log("[INFO] Costmap websocket open");
}

function getGradientColor(value){
    const num_colors = 2;
    var colors = new Array();
    colors[0] = new Array(1,0,0);
    colors[1] = new Array(33/255, 150/255,243/255);


    var idx1, idx2;        // |-- Our desired color will be between these two indexes in "color".
    var fractBetween = 0;  // Fraction between "idx1" and "idx2" where our value is.

    if(value <= 0) idx1 = idx2 = 0;
    else if(value >= 1) idx1 = idx2 = num_colors-1;
    else {
        value = value * (num_colors-1);
        idx1  = Math.floor(value);
        idx2  = idx1+1;
        fractBetween = value - idx1;
    }

    var red   = (colors[idx2][0] - colors[idx1][0])*fractBetween + colors[idx1][0];
    var green = (colors[idx2][1] - colors[idx1][1])*fractBetween + colors[idx1][1];
    var blue  = (colors[idx2][2] - colors[idx1][2])*fractBetween + colors[idx1][2];

    return {"r": red, "g": green, "b": blue};
}

costmap_ws.onmessage = function (evt) {
    if (r_costmap){
        var received_msg = evt.data;

        var parser = new jParser(received_msg, {
            ptcloud_metadata_t: {
                magic_number: 'uint32',
                timestamp_ns: ['array', 'uint32', 2],
                n_points: 'uint32',
                format: 'uint32'
            },
            point_data: {
                x: 'float32',
                y: 'float32',
                z: 'float32',
                i: 'float32'
            }
        });

        var ptcloud_meta = parser.parse('ptcloud_metadata_t');

        // ptcloud attributes
        const distances = [];
        const good_dists = [];
        const colors = [];
        const positions = [];
        //                    0.023529412, 0.2, 0.250980392
        // const free_color = (0, 0, 1);
        // const occ_color = (1, 0, 0);

        for (var i = 0; i < ptcloud_meta.n_points; i++){
            var curr_point = parser.parse('point_data');
            distances.push(curr_point.i);
            if (curr_point.i < 10) good_dists.push(curr_point.i);
            positions.push(curr_point.x, curr_point.y, curr_point.z);
        }

        var dist_min = Math.min.apply(Math, good_dists);
        var dist_max = Math.max.apply(Math, good_dists);

        for (var i = 0; i < distances.length-1; i++){
            var norm_d;
            if (distances[i] < 10) norm_d = (distances[i] - dist_min)/(dist_max - dist_min);
            else norm_d = 1;
            var new_color = getGradientColor(norm_d);
            colors.push(new_color.r, new_color.g, new_color.b);
        }
        colors.push(0,1,0);

        if (first_cost){
            first_cost = false;
            perspectiveCamera.position.x = 0;
            perspectiveCamera.position.y = 0;
            perspectiveCamera.position.z = -50;

            const pt_geometry = new THREE.BufferGeometry();
            pt_geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
            pt_geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );

            // pt_geometry.computeBoundingSphere(); // why

            const material = new THREE.PointsMaterial( { size: 0.40, vertexColors: true } );

            m_costmap = new THREE.Points( pt_geometry, material );
        }

        else {
            const old_positions = m_costmap.geometry.attributes.position.array;
            const conc_positions = positions.concat(old_positions);

            const old_colors = m_costmap.geometry.attributes.color.array;
            const conc_colors = colors.concat(old_colors);

            m_costmap.geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( conc_positions, 3 ) );

            m_costmap.geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( conc_colors, 3 ) );
        }

        // required after the first render
        m_costmap.geometry.attributes.position.needsUpdate = true;
        m_costmap.geometry.attributes.color.needsUpdate = true;

        scene.add( m_costmap );
        animate();
    }
    else {
        console.log("trying to remove costmap");
        scene.remove( m_costmap );
        first_cost = true;
    }
}

costmap_ws.onclose = function() {
    console.log("[INFO] Costmap websocket closed");
}

//////////////////////////////////////////////////////////
// Handle all of our buttons
//////////////////////////////////////////////////////////
const home = document.getElementById('home');

const pose_btn = document.getElementById('pose_btn');
const ptcloud_btn = document.getElementById('ptcloud_btn');
const path_btn = document.getElementById('path_btn');

const plan_act_btn = document.getElementById('plan_action');
const plan_point_btn = document.getElementById('plan_point_action');
const plan_point_go = document.getElementById('plan_point_go');
const plan_point_back = document.getElementById('plan_point_back');

const load_map_btn = document.getElementById('load_action');
const load_form = document.getElementById('load_form');
const load_file_path = document.getElementById('load_file_name');
const load_form_sub_btn = document.getElementById('load_sub_action');
const load_back_btn = document.getElementById("load_back");

const save_map_btn = document.getElementById('save_action')
const save_form = document.getElementById('save_form');
const save_file_path = document.getElementById('save_file_name');
const save_form_sub_btn = document.getElementById('save_sub_action');
const save_back_btn = document.getElementById('save_back');

const clear_map_btn = document.getElementById('clear_action');
const reset_vio_btn = document.getElementById('reset_action');

const mode_btn = document.getElementById('mode_btn');

const two_d = document.getElementById('2d');
const three_d = document.getElementById('3d');
const sat_d = document.getElementById('sat');

const path_go = document.getElementById('path_go');
const path_stop = document.getElementById('path_stop');
const path_pause = document.getElementById('path_pause');
const path_land = document.getElementById('path_land');

const stream_add_btn = document.getElementById('stream_add');
const stream0 = document.getElementById('stream0');
const stream_rem_btn = document.getElementById('stream_remove');

function showPathOptions(){
    path_go.className = "w3-button w3-green";
    path_stop.className = "w3-button w3-red";
    path_pause.className = "w3-button w3-orange";
    path_land.className = "w3-button w3-teal";
}

function resetLeftButtons() {
    plan_point_btn.className = 'w3-button w3-block w3-blue';
    load_map_btn.className = 'w3-button w3-block w3-blue';
    save_map_btn.className = 'w3-button w3-block w3-blue';
    plan_act_btn.className = 'w3-button w3-block w3-blue';
    clear_map_btn.className = 'w3-button w3-block w3-blue';
    reset_vio_btn.className = 'w3-button w3-block w3-blue';

    save_form.style.display = 'none';
    load_form.style.display = 'none';

    plan_point_back.className = 'w3-hide';
    plan_point_go.className = 'w3-hide';

    if (curr_mode != modes.COSTMAP){
        ptcloud_btn.className = "w3-block w3-button w3-red";
        pose_btn.className = "w3-block w3-button w3-green";
        path_btn.className = "w3-block w3-button w3-red";
    }
}

function hideLeftButtons() {
    plan_point_btn.className = 'w3-hide';
    load_map_btn.className = 'w3-hide';
    save_map_btn.className = 'w3-hide';
    plan_act_btn.className = 'w3-hide';
    clear_map_btn.className = 'w3-hide';
    reset_vio_btn.className = 'w3-hide';

    save_form.style.display = 'none';
    load_form.style.display = 'none';

    plan_point_back.className = 'w3-hide';
    plan_point_go.className = 'w3-hide';

    ptcloud_btn.className = "w3-hide";
    pose_btn.className = "w3-hide";
    path_btn.className = "w3-hide";
}

function changeMode(new_mode){
    if (curr_mode == new_mode) return;

    switch (new_mode){
        case modes.COSTMAP:
            plan_point_btn.className = 'w3-button w3-block w3-blue';
            two_d.className = "w3-button w3-blue-grey";
            three_d.className = "w3-button w3-dark-grey";
            sat_d.className = "w3-button w3-dark-grey";
            ptcloud_btn.className = "w3-hide";
            pose_btn.className = "w3-hide";
            path_btn.className = "w3-hide";
            r_mesh = false;
            r_pose = false;
            r_paths = false;
            r_ptcloud = false;
            r_costmap = true;
            controls.reset();
            controls.noRotate = true;
            cam_update = true;
            curr_mode = new_mode;
            perspectiveCamera.position.z = -50;
            break;

        case modes.MESH:
            r_costmap = false;
            three_d.className = "w3-button w3-blue-grey";
            two_d.className = "w3-button w3-dark-grey";
            sat_d.className = "w3-button w3-dark-grey";
            ptcloud_btn.className = "w3-button w3-block w3-red";
            pose_btn.className = "w3-button w3-block w3-green";
            path_btn.className = "w3-button w3-block w3-red";
            plan_point_btn.className = "w3-hide";
            r_pose = true;
            r_mesh = true;
            perspectiveCamera.position.z = 50;
            createControls( perspectiveCamera );
            cam_update = true;
            curr_mode = new_mode;
            break;

        case modes.SAT:
            sat_d.className = "w3-button w3-blue-grey";
            three_d.className = "w3-button w3-dark-grey";
            two_d.className = "w3-button w3-dark-grey";
            curr_mode = new_mode;
            break;
    }
}


// always checking if home is clicked, if so, close ws
home.addEventListener("click", () => {
	mesh_ws.close();
    pose_ws.close();
    plan_ws.close();
    ptcloud_ws.close();
});

two_d.addEventListener("click", () => {
    changeMode(modes.COSTMAP);
})

three_d.addEventListener("click", () => {
    changeMode(modes.MESH);
})

sat_d.addEventListener("click", () => {
    changeMode(modes.SAT);
})

mode_btn.addEventListener("click", () => {
    if (mode_btn.classList.contains("w3-black")){
        mode_btn.className = "w3-button w3-block w3-white";
        scene.background = new THREE.Color( 0x000000 );
    }
    else {
        mode_btn.className = "w3-button w3-block w3-black";
        scene.background = new THREE.Color( 0xcccccc );
    }
})

path_go.addEventListener("click", () => {
    if (plan_ws.readyState == WebSocket.OPEN){
        plan_ws.send("follow_path");
    }
    else {
        console.log("uh oh. Plan websocket is closed...");
    }
})


pose_btn.addEventListener("click", () => {
    if (pose_btn.classList.contains("w3-red")) {
        pose_btn.className = "w3-button w3-block w3-green";
        r_pose = true;
    }
    else {
        pose_btn.className = "w3-button w3-block w3-red";
        r_pose = false;
    }
});

ptcloud_btn.addEventListener("click", () => {
    if (ptcloud_btn.classList.contains("w3-red")) {
        ptcloud_btn.className = "w3-button w3-block w3-green";
        r_ptcloud = true;
    }
    else {
        ptcloud_btn.className = "w3-button w3-block w3-red";
        r_ptcloud = false;
    }
});

path_btn.addEventListener("click", () => {
    if (path_btn.classList.contains("w3-red")) {
        path_btn.className = "w3-button w3-block w3-green";
        r_paths = true;
    }
    else {
        path_btn.className = "w3-button w3-block w3-red";
        r_paths = false;
    }
});

plan_act_btn.addEventListener("click", () => {
    if (plan_ws.readyState ==  WebSocket.OPEN){
        plan_ws.send("plan_home");
    }
    else {
        console.log("uh oh. Plan websocket is closed...");
    }
})

plan_point_btn.addEventListener("click", () => {
    click_plan = true;
    hideLeftButtons();
    plan_point_back.className = 'w3-button w3-red';
    plan_point_go.className = 'w3-button w3-green';
})

plan_point_go.addEventListener("click", () => {
    var pose = [];
    pose = plan_pt.geometry.attributes.position.array;
    console.log(pose);
    var pose_str = pose.toString();
    const msg = "plan_to: ";
    const conc_msg = msg.concat(pose_str);
    if (plan_ws.readyState ==  WebSocket.OPEN){
        plan_ws.send(conc_msg);
    }
    else {
        console.log("uh oh. Plan websocket is closed...");
        scene.remove(plan_pt);
    }
    resetLeftButtons();
})

plan_point_back.addEventListener("click", () => {
    scene.remove(plan_pt);
    resetLeftButtons();
})

canvas.onclick = function getClicked3DPoint(evt) {
    if (click_plan){
        var vec = new THREE.Vector3(); // create once and reuse
        var pos = new THREE.Vector3(); // create once and reuse

        vec.set(
            ( evt.clientX / window.innerWidth ) * 2 - 1,
            - ( evt.clientY / window.innerHeight ) * 2 + 1,
            0.5 );

        vec.unproject( perspectiveCamera );

        vec.sub( perspectiveCamera.position ).normalize();

        var distance = - perspectiveCamera.position.z / vec.z;

        pos.copy( perspectiveCamera.position ).add( vec.multiplyScalar( distance ) );
        pos.z = 0.0;

        const plan_geom = new THREE.BufferGeometry();
        const col = [0, 0, 1];
        plan_geom.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
        plan_geom.setAttribute( 'color', new THREE.Float32BufferAttribute( col, 3 ) );

        plan_geom.computeBoundingSphere();

        const material = new THREE.PointsMaterial( { size: 0.20, vertexColors: true } );

        plan_pt = new THREE.Points( plan_geom, material );
        scene.add(plan_pt);

        click_plan = false;
    }
};

load_map_btn.addEventListener("click", () => {
    hideLeftButtons();
    load_form.style.display = 'block';
})

load_back_btn.addEventListener("click", () => {
    resetLeftButtons();
})

save_map_btn.addEventListener("click", () => {
    hideLeftButtons();
    save_form.style.display = 'block';
})

save_back_btn.addEventListener("click", () => {
    resetLeftButtons();
})

load_form_sub_btn.addEventListener("click", () => {
    if (plan_ws.readyState ==  WebSocket.OPEN){
        var file_path = load_file_path.value;
        file_path = file_path.replace(/\s+/g, '');
        if (file_path.length == 0){
            console.log("msg sent");
            plan_ws.send("load_map");
        }
        else {
            const msg = "load_map file: ";
            const conc_msg = msg.concat(file_path);
            console.log(conc_msg);
            plan_ws.send(conc_msg);
        }
    }
    else {
        console.log("uh oh. Plan websocket is closed...");
    }
    resetLeftButtons();
})

save_form_sub_btn.addEventListener("click", () => {
    if (plan_ws.readyState ==  WebSocket.OPEN){
        var file_path = save_file_path.value;
        file_path = file_path.replace(/\s+/g, '');

        if (file_path.length == 0){
            plan_ws.send("save_map");
        }
        else {
            const msg = "save_map file: ";
            const conc_msg = msg.concat(file_path);
            console.log(conc_msg);
            plan_ws.send(conc_msg);
        }
    }
    else {
        console.log("uh oh. Plan websocket is closed...");
    }
    resetLeftButtons();
})

clear_map_btn.addEventListener("click", () => {
    if (plan_ws.readyState ==  WebSocket.OPEN){
        plan_ws.send("clear_map");

        scene.remove( m_mesh );
        new_mesh = true;
        m_mesh = null;
    }
    else {
        console.log("uh oh. Plan websocket is closed...");
    }
})

reset_vio_btn.addEventListener("click", () => {
    if (plan_ws.readyState ==  WebSocket.OPEN){
        plan_ws.send("reset_vio");

        scene.remove(line_x);
        scene.remove(line_y);
        scene.remove(line_z);
        first_pose = true;
    }
    else {
        console.log("uh oh. Plan websocket is closed...");
    }
})

function createControls( camera ) {
    controls = new TrackballControls( camera, renderer.domElement );
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    perspectiveCamera.position.z = 50;

    if (r_mesh) controls.rotateSpeed = 1.0;
    else controls.noRotate = true;

    controls.keys = [ 'KeyA', 'KeyS', 'KeyD' ];

}

function onWindowResize() {

    const aspect = window.innerWidth / window.innerHeight;

    perspectiveCamera.aspect = aspect;
    perspectiveCamera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

    controls.handleResize();

}

function animate() {

    requestAnimationFrame( animate );

    controls.update();

    render();

}

function render() {

    const camera = perspectiveCamera;

    renderer.render( scene, camera );

}

function closeCameraAcc(){

    //Close and remove the green coloring of the dropdown
    var x = document.getElementById("cameraAcc");
    x.className = x.className.replace(" w3-show", "");

    //Remove all the children, they should get repopulated to ensure no faulty cameras
    var eles = document.getElementsByClassName("cam-item");
    while(eles[0]) {
      eles[0].parentNode.removeChild(eles[0]);
    }

}

stream_rem_btn.addEventListener("click", () => {
    stream0.src = "";
    stream0.className = "w3-hide";
    var div = document.getElementById('stream_div');
    div.style = "";
    stream_rem_btn.className="w3-hide";
})

stream_add_btn.addEventListener("click", () => {
    var x = document.getElementById("cameraAcc");
    if (x.className.indexOf("w3-show") == -1) {
      updateCameraList();
    } else {
      closeCameraAcc();
    }
})

function updateCameraList(){
    fetch('/_cmd/list_cameras').then(function(response) {
      return response.text().then(function(text) {
        var y = document.getElementById("cameraAcc");
        var cams = text.split(" ");

        for(var i = 0; i < cams.length; i++){
          if(cams[i].length < 1) continue;

          var ele = document.createElement("a");
          ele.setAttribute("id",       "btn_"+cams[i]);
          ele.setAttribute("pipe",     cams[i]);
          ele.addEventListener("click", function(e) {
            var imgString = "/video/"+this.getAttribute("pipe");
            stream0.src = imgString;
            stream0.className = "";
            stream_rem_btn.className = "w3-button w3-red";
            closeCameraAcc();
        })

          ele.classList.add("cam-item");
          ele.classList.add("w3-bar-item");
          ele.classList.add("w3-button");
          ele.classList.add("w3-green");

          var nameList = cams[i].split("_");
          for(var j = 0; j < nameList.length; j++){
            if(nameList[j].length < 1) continue;
            nameList[j] = nameList[j][0].toUpperCase() + nameList[j].substring(1);
          }
          ele.textContent = nameList.join(' ');
          y.appendChild(ele);
        }

        y.className += " w3-show";
      });
    });

}
