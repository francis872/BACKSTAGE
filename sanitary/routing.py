"""CVRP/VRPTW on a declared road matrix, with independently checked output."""
import math
import time
import numpy as np
import ortools
from ortools.constraint_solver import pywrapcp,routing_enums_pb2

SCALE=1000000


def number(value,name,minimum=0,maximum=1e12):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not minimum<=value<=maximum:raise ValueError(f"{name}: número fuera de rango.")
    return float(value)


def matrix(value,n,name):
    if not isinstance(value,list) or len(value)!=n or any(not isinstance(row,list) or len(row)!=n for row in value):raise ValueError(f"{name}: matriz cuadrada n×n requerida.")
    result=np.array([[number(v,name,0,1e9) for v in row] for row in value])
    if not np.allclose(np.diag(result),0):raise ValueError("La diagonal de las matrices debe ser cero.")
    return result


def solve(payload):
    started=time.perf_counter();nodes=payload.get('nodes');vehicles=payload.get('vehicles');mat=payload.get('matrix')
    if not isinstance(nodes,list) or not 2<=len(nodes)<=100 or not isinstance(vehicles,list) or not 1<=len(vehicles)<=20:raise ValueError('Se requieren 2–100 nodos y 1–20 vehículos.')
    if not isinstance(mat,dict) or not isinstance(mat.get('source'),dict) or not mat['source'].get('name'):raise ValueError('Declara la fuente y naturaleza de la matriz; no se inventan distancias viales.')
    n=len(nodes);distance=matrix(mat.get('distance_m'),n,'distance_m');travel=np.ceil(matrix(mat.get('duration_s'),n,'duration_s')).astype(np.int64)
    identifiers=[str(node.get('id','')) for node in nodes];vehicle_ids=[str(v.get('id','')) for v in vehicles]
    if any(not i or len(i)>120 for i in identifiers+vehicle_ids) or len(set(identifiers))!=n or len(set(vehicle_ids))!=len(vehicles):raise ValueError('IDs de nodos y vehículos deben ser únicos y no vacíos.')
    if not isinstance(mat.get('node_ids'),list) or [str(i) for i in mat['node_ids']]!=identifiers:raise ValueError('node_ids debe coincidir exactamente con el orden de los nodos de la matriz.')
    demands=[int(round(number(node.get('demand_kg',0),'demand_kg',0,1e7)*1000)) for node in nodes]
    service=[int(math.ceil(number(node.get('service_s',0),'service_s',0,86400))) for node in nodes]
    horizon=int(number(payload.get('horizon_s',86400),'horizon_s',1,172800))
    def window(value,name):
        if not isinstance(value,list) or len(value)!=2:raise ValueError(f'{name} requiere [inicio, fin].')
        a,b=[int(number(v,name,0,horizon)) for v in value]
        if a>b:raise ValueError(f'{name}: intervalo desordenado.')
        return a,b
    windows=[window(node.get('time_window_s',[0,horizon]),'time_window_s') for node in nodes]
    shifts=[window(v.get('shift_s',[0,horizon]),'shift_s') for v in vehicles]
    starts=[];ends=[];capacities=[]
    for vehicle in vehicles:
        for key,target in (('start_index',starts),('end_index',ends)):
            index=vehicle.get(key,vehicle.get('start_index',0) if key=='end_index' else 0)
            if isinstance(index,bool) or not isinstance(index,int) or not 0<=index<n:raise ValueError('Índice de depósito inválido.')
            target.append(index)
        capacities.append(int(round(number(vehicle.get('capacity_kg'),'capacity_kg',.001,1e7)*1000)))
    depots=set(starts+ends)
    if any(demands[i]!=0 or service[i]!=0 for i in depots):raise ValueError('Los depósitos deben tener demanda y servicio cero; no se admiten descargas intermedias implícitas.')
    for node in nodes:
        if 'optional' in node and not isinstance(node['optional'],bool):raise ValueError('optional requiere booleano.')
    mandatory=[i for i in range(n) if i not in depots and nodes[i].get('optional') is not True]
    if any(demands[i]>max(capacities) for i in mandatory) or sum(demands[i] for i in mandatory)>sum(capacities):
        return{'status':'INFEASIBLE_CAPACITY','feasible':False,'optimality_proven':False,'reason':'Demanda obligatoria supera capacidad de un vehículo o capacidad total de una sola carga por vehículo.','solver_version':ortools.__version__}
    objective=payload.get('objective',{});weights={'distance':1.,'time':0.,'cost':0.,'emissions':0.,'penalty':1.,'balance':0.,**objective.get('weights',{})}
    scales={'distance':1000.,'time':3600.,'cost':1.,'emissions':1.,'penalty':1.,'balance':1000.,**objective.get('scales',{})}
    if set(weights)!={'distance','time','cost','emissions','penalty','balance'} or set(scales)!=set(weights):raise ValueError('Términos de objetivo no admitidos.')
    weights={key:number(v,f'weight {key}',0,1e6) for key,v in weights.items()};scales={key:number(v,f'scale {key}',1e-6,1e12) for key,v in scales.items()}
    if not any(weights.values()):raise ValueError('Al menos un peso del objetivo debe ser positivo.')
    if weights['cost']>0 and (not isinstance(payload.get('currency'),str) or len(payload['currency'])!=3):raise ValueError('El objetivo de costo requiere moneda ISO declarada.')
    if weights['emissions']>0 and any(not v.get('emission_factor_source') or v.get('emission_kgco2e_per_km') is None for v in vehicles):raise ValueError('Minimizar emisiones requiere factores vehiculares con fuente declarada.')
    if weights['cost']>0 and any(v.get('cost_per_km') is None or v.get('cost_per_hour') is None for v in vehicles):raise ValueError('Minimizar costo requiere tarifas por km y hora de cada vehículo.')
    costs=[number(v.get('cost_per_km',0),'cost_per_km') for v in vehicles];hourly=[number(v.get('cost_per_hour',0),'cost_per_hour') for v in vehicles]
    fixed=[number(v.get('fixed_cost',0),'fixed_cost') for v in vehicles];emissions=[number(v.get('emission_kgco2e_per_km',0),'emission rate') for v in vehicles]
    priorities=[number(node.get('priority',1000),'priority',0,1e9) for node in nodes]
    worst_distance=float(distance.max())*(n+2*len(vehicles));worst_time=horizon*len(vehicles)
    worst={'distance':worst_distance,'time':worst_time,'cost':worst_distance/1000*max(costs)+worst_time/3600*max(hourly)+sum(fixed),'emissions':worst_distance/1000*max(emissions),'penalty':sum(priorities),'balance':max(capacities)/1000}
    if sum(weights[k]*worst[k]/scales[k] for k in weights)*SCALE>9e15:raise ValueError('Objetivo excede el límite de precisión; reduce pesos o aumenta escalas.')
    manager=pywrapcp.RoutingIndexManager(n,len(vehicles),starts,ends);routing=pywrapcp.RoutingModel(manager)
    callbacks=[]
    for v in range(len(vehicles)):
        arc=distance*(weights['distance']/scales['distance']+weights['cost']*costs[v]/1000/scales['cost']+weights['emissions']*emissions[v]/1000/scales['emissions'])*SCALE
        if arc.max()>1e14:raise ValueError('Objetivo fuera de precisión numérica; aumenta las escalas.')
        integers=np.rint(arc).astype(np.int64)
        def cost_callback(a,b,table=integers):return int(table[manager.IndexToNode(a),manager.IndexToNode(b)])
        callbacks.append(cost_callback);index=routing.RegisterTransitCallback(cost_callback);routing.SetArcCostEvaluatorOfVehicle(index,v)
        routing.SetFixedCostOfVehicle(int(round(fixed[v]*weights['cost']/scales['cost']*SCALE)),v)
    def demand_callback(index):return demands[manager.IndexToNode(index)]
    callback=routing.RegisterUnaryTransitCallback(demand_callback);routing.AddDimensionWithVehicleCapacity(callback,0,capacities,True,'Capacity')
    if weights['balance']>0:routing.GetDimensionOrDie('Capacity').SetGlobalSpanCostCoefficient(int(round(SCALE*weights['balance']/scales['balance']/1000)))
    def time_callback(a,b):
        if routing.IsStart(a) and routing.IsEnd(b):return 0
        i,j=manager.IndexToNode(a),manager.IndexToNode(b)
        return int(travel[i,j])+service[i]
    transit=routing.RegisterTransitCallback(time_callback);routing.AddDimension(transit,horizon,horizon,False,'Time');time_dim=routing.GetDimensionOrDie('Time')
    for node in range(n):
        if node not in depots:time_dim.CumulVar(manager.NodeToIndex(node)).SetRange(*windows[node])
    for v in range(len(vehicles)):
        low=max(shifts[v][0],windows[starts[v]][0]);high=min(shifts[v][1],windows[starts[v]][1])
        end_low=max(shifts[v][0],windows[ends[v]][0]);end_high=min(shifts[v][1],windows[ends[v]][1])
        if low>high or end_low>end_high:return{'status':'INFEASIBLE_SHIFT','feasible':False,'optimality_proven':False,'reason':'Turno y disponibilidad del depósito no se intersectan.'}
        time_dim.CumulVar(routing.Start(v)).SetRange(low,high);time_dim.CumulVar(routing.End(v)).SetRange(end_low,end_high)
        coefficient=int(round(SCALE*(weights['time']/scales['time']+weights['cost']*hourly[v]/3600/scales['cost'])))
        time_dim.SetSpanCostCoefficientForVehicle(coefficient,v)
        routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(routing.Start(v)));routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(routing.End(v)))
    for i,node in enumerate(nodes):
        priority=priorities[i]
        if i not in depots and node.get('optional') is True:routing.AddDisjunction([manager.NodeToIndex(i)],int(round(priority*weights['penalty']/scales['penalty']*SCALE)))
    params=pywrapcp.DefaultRoutingSearchParameters();params.first_solution_strategy=routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic=routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    limit=number(payload.get('time_limit_s',3),'time_limit_s',.1,15);params.time_limit.FromMilliseconds(int(limit*1000));params.log_search=False
    assignment=routing.SolveWithParameters(params);status=int(routing.status())
    if not assignment:return{'status':'INFEASIBLE' if status==6 else 'NO_SOLUTION_FOUND_WITHIN_LIMIT','feasible':False,'optimality_proven':False,'solver_status':status,'reason':'Restricciones de capacidad/tiempo incompatibles o búsqueda sin solución dentro del límite; no se prueba inviabilidad si expira el tiempo.','duration_ms':(time.perf_counter()-started)*1000}
    routes=[];visited=[];total_distance=0.;total_time=0;total_cost=0.;total_emissions=0.;maximum_load=0.
    for v,vehicle in enumerate(vehicles):
        index=routing.Start(v);visits=[];route_distance=0.;load=0
        while not routing.IsEnd(index):
            node=manager.IndexToNode(index);arrival=int(assignment.Value(time_dim.CumulVar(index)));load+=demands[node]
            visits.append({'node_index':node,'node_id':identifiers[node],'arrival_s':arrival,'load_kg':load/1000})
            if node not in depots:visited.append(node)
            next_index=int(assignment.Value(routing.NextVar(index)));route_distance+=float(distance[node,manager.IndexToNode(next_index)]);index=next_index
        node=manager.IndexToNode(index);finish=int(assignment.Value(time_dim.CumulVar(index)));visits.append({'node_index':node,'node_id':identifiers[node],'arrival_s':finish,'load_kg':load/1000})
        used=len(visits)>2;duration=finish-visits[0]['arrival_s'] if used else 0
        if not used:route_distance=0.
        cost=route_distance/1000*costs[v]+duration/3600*hourly[v]+(fixed[v] if used else 0);carbon=route_distance/1000*emissions[v]
        routes.append({'vehicle_id':vehicle_ids[v],'used':used,'visits':visits,'distance_m':route_distance,'duration_s':duration,'load_kg':load/1000,'capacity_kg':capacities[v]/1000,'utilization_percent':100*load/capacities[v],'cost':cost if vehicle.get('cost_per_km') is not None and vehicle.get('cost_per_hour') is not None else None,'estimated_kgco2e':carbon if vehicle.get('emission_kgco2e_per_km') is not None else None})
        total_distance+=route_distance;total_time+=duration;total_cost+=cost;total_emissions+=carbon;maximum_load=max(maximum_load,load/1000)
    dropped=[i for i in range(n) if i not in depots and i not in visited]
    terms={'distance':total_distance,'time':total_time,'cost':total_cost,'emissions':total_emissions,'penalty':sum(priorities[i] for i in dropped),'balance':maximum_load}
    recomputed=sum(weights[key]*terms[key]/scales[key] for key in weights)
    validation=[]
    if len(set(visited))!=len(visited) or any(i not in visited for i in mandatory):validation.append('mandatory_or_duplicate_visit')
    for route,v in zip(routes,range(len(vehicles))):
        if not route['used']:continue
        if route['load_kg']>capacities[v]/1000+1e-9:validation.append('capacity')
        for previous,current in zip(route['visits'],route['visits'][1:]):
            i,j=previous['node_index'],current['node_index'];arrival=current['arrival_s']
            if arrival<previous['arrival_s']+int(travel[i,j])+service[i]:validation.append('travel_time')
            if not windows[j][0]<=arrival<=windows[j][1]:validation.append('time_window')
        if route['visits'][0]['arrival_s']<shifts[v][0] or route['visits'][-1]['arrival_s']>shifts[v][1]:validation.append('shift')
    if validation:raise ValueError('La verificación independiente rechazó la solución: '+','.join(set(validation)))
    return{'status':'FEASIBLE','feasible':True,'optimality_proven':status==7,'solver_status':status,'solver':'OR-Tools routing constraint solver','solver_version':ortools.__version__,'routes':routes,'dropped_node_ids':[identifiers[i] for i in dropped],'served_node_ids':[identifiers[i] for i in visited],'totals':{'distance_m':total_distance,'duration_s':total_time,'cost':total_cost if all(v.get('cost_per_km') is not None and v.get('cost_per_hour') is not None for v in vehicles) else None,'currency':payload.get('currency'),'estimated_kgco2e':total_emissions if all(v.get('emission_kgco2e_per_km') is not None for v in vehicles) else None},'objective':{'weights':weights,'scales':scales,'raw_terms':terms,'normalized_weighted_sum':recomputed,'integer_solver_value':assignment.ObjectiveValue(),'integer_scale':SCALE,'integer_rounding_warning':'Las tarifas se discretizan a 1e-6 y los tiempos se redondean hacia arriba a segundos.'},'independent_validation':{'valid':True,'checks':['mandatory_visits','no_duplicates','capacity','travel_and_service_time','time_windows','shifts']},'matrix_source':mat['source'],'duration_ms':(time.perf_counter()-started)*1000,'warnings':['Propuesta matemática: requiere revisión y aprobación antes de operar.','Los costos y emisiones son estimados con tarifas y factores declarados; no son ahorros medidos.','Una carga por vehículo, sin descarga intermedia. La matriz no representa tráfico en vivo salvo que su fuente lo acredite.','Se devuelve orden de visitas; no se dibujan segmentos rectos como geometría vial.']}
