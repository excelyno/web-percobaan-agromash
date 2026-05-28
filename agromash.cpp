// ============================================================
// AGROMESH - Smart Farming IoT Network Simulator
// Algorithms : Kruskal MST, BFS, Brute Force Gateway Optimization
// Input      : sensors.csv
// Compile    : g++ -std=c++17 agromesh.cpp -o agromesh
// Run        : ./agromesh sensors.csv
// ============================================================

#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <cmath>
#include <iomanip>

using namespace std;

// ============================================================
// 1. DATA STRUCTURES
// ============================================================

struct Sensor {
    int id;
    string name;
    string type;
    double x;
    double y;
    double z;
};

struct Edge {
    int from;
    int to;
    double cost;
};

struct GatewayResult {
    int gatewayId;
    vector<int> hopDistance;
    double averageHop;
    int maximumHop;
};

struct MultiGatewayResult {
    vector<int> gatewayIds;
    vector<int> nearestHop;
    double averageNearestHop;
    int maximumNearestHop;
};

// ============================================================
// 2. BASIC HELPER FUNCTIONS
// Dibuat manual agar tidak terlalu banyak memakai library tambahan.
// ============================================================

string trim(const string& text) {
    int start = 0;
    int end = static_cast<int>(text.length()) - 1;

    while (start <= end && (text[start] == ' ' || text[start] == '\t' || text[start] == '\r' || text[start] == '\n')) {
        start++;
    }

    while (end >= start && (text[end] == ' ' || text[end] == '\t' || text[end] == '\r' || text[end] == '\n')) {
        end--;
    }

    if (start > end) {
        return "";
    }

    return text.substr(start, end - start + 1);
}

vector<string> splitCSVLine(const string& line) {
    vector<string> columns;
    string current = "";
    bool insideQuote = false;

    for (int i = 0; i < static_cast<int>(line.length()); i++) {
        char ch = line[i];

        if (ch == '"') {
            insideQuote = !insideQuote;
        } else if (ch == ',' && !insideQuote) {
            columns.push_back(trim(current));
            current = "";
        } else {
            current += ch;
        }
    }

    columns.push_back(trim(current));
    return columns;
}

bool nearlyEqual(double a, double b) {
    double difference = a - b;
    if (difference < 0) {
        difference = -difference;
    }
    return difference < 0.000000001;
}

int getSmallerInt(int a, int b) {
    if (a < b) {
        return a;
    }
    return b;
}

int getLargerInt(int a, int b) {
    if (a > b) {
        return a;
    }
    return b;
}

string joinGatewayIds(const vector<int>& gatewayIds) {
    stringstream result;

    for (int i = 0; i < static_cast<int>(gatewayIds.size()); i++) {
        if (i > 0) {
            result << ";";
        }
        result << gatewayIds[i];
    }

    return result.str();
}

// ============================================================
// 3. CSV READER
// Tugas bagian ini hanya membaca file CSV menjadi vector<Sensor>.
// Format wajib CSV:
// id,name,type,x,y,z
// ============================================================

bool loadSensorsFromCSV(const string& filename, vector<Sensor>& sensors) {
    ifstream file(filename.c_str());

    if (!file.is_open()) {
        cout << "ERROR: File tidak dapat dibuka: " << filename << endl;
        return false;
    }

    string line;
    int lineNumber = 0;

    // Header: id,name,type,x,y,z
    if (!getline(file, line)) {
        cout << "ERROR: File CSV kosong." << endl;
        return false;
    }

    lineNumber++;

    while (getline(file, line)) {
        lineNumber++;

        if (trim(line) == "") {
            continue;
        }

        vector<string> col = splitCSVLine(line);

        if (col.size() != 6) {
            cout << "ERROR: Baris " << lineNumber << " tidak memiliki 6 kolom." << endl;
            return false;
        }

        Sensor sensor;

        stringstream ssId(col[0]);
        stringstream ssX(col[3]);
        stringstream ssY(col[4]);
        stringstream ssZ(col[5]);

        if (!(ssId >> sensor.id)) {
            cout << "ERROR: ID tidak valid pada baris " << lineNumber << endl;
            return false;
        }

        sensor.name = col[1];
        sensor.type = col[2];

        if (!(ssX >> sensor.x)) {
            cout << "ERROR: Koordinat x tidak valid pada baris " << lineNumber << endl;
            return false;
        }

        if (!(ssY >> sensor.y)) {
            cout << "ERROR: Koordinat y tidak valid pada baris " << lineNumber << endl;
            return false;
        }

        if (!(ssZ >> sensor.z)) {
            cout << "ERROR: Koordinat z tidak valid pada baris " << lineNumber << endl;
            return false;
        }

        sensors.push_back(sensor);
    }

    return true;
}

bool validateSensors(const vector<Sensor>& sensors) {
    if (sensors.size() < 2) {
        cout << "ERROR: Minimal dibutuhkan 2 sensor." << endl;
        return false;
    }

    for (int i = 0; i < static_cast<int>(sensors.size()); i++) {
        if (sensors[i].name == "") {
            cout << "ERROR: Sensor ID " << sensors[i].id << " tidak memiliki nama." << endl;
            return false;
        }

        if (sensors[i].type == "") {
            cout << "ERROR: Sensor ID " << sensors[i].id << " tidak memiliki tipe." << endl;
            return false;
        }

        for (int j = i + 1; j < static_cast<int>(sensors.size()); j++) {
            if (sensors[i].id == sensors[j].id) {
                cout << "ERROR: Terdapat ID sensor duplikat: " << sensors[i].id << endl;
                return false;
            }
        }
    }

    return true;
}

// ============================================================
// 4. GRAPH BUILDER
// Bagian ini mengubah data sensor menjadi complete graph berbobot.
// Vertex = sensor
// Edge   = kemungkinan koneksi antar sensor
// Cost   = jarak Euclidean 3D
// ============================================================

double calculateEuclideanDistance(const Sensor& a, const Sensor& b) {
    double dx = b.x - a.x;
    double dy = b.y - a.y;
    double dz = b.z - a.z;

    return sqrt(dx * dx + dy * dy + dz * dz);
}

vector<Edge> buildCompleteGraph(const vector<Sensor>& sensors) {
    vector<Edge> edges;
    int totalSensors = static_cast<int>(sensors.size());

    for (int i = 0; i < totalSensors; i++) {
        for (int j = i + 1; j < totalSensors; j++) {
            Edge edge;
            edge.from = i;
            edge.to = j;
            edge.cost = calculateEuclideanDistance(sensors[i], sensors[j]);
            edges.push_back(edge);
        }
    }

    return edges;
}

// ============================================================
// 5. MANUAL MERGE SORT FOR EDGES
// Dibuat sendiri agar tidak perlu memakai <algorithm> sort().
// Dipakai oleh Kruskal untuk mengurutkan edge dari cost terkecil.
// ============================================================

void mergeEdges(vector<Edge>& edges, int left, int mid, int right) {
    vector<Edge> temporary;
    int i = left;
    int j = mid + 1;

    while (i <= mid && j <= right) {
        if (edges[i].cost <= edges[j].cost) {
            temporary.push_back(edges[i]);
            i++;
        } else {
            temporary.push_back(edges[j]);
            j++;
        }
    }

    while (i <= mid) {
        temporary.push_back(edges[i]);
        i++;
    }

    while (j <= right) {
        temporary.push_back(edges[j]);
        j++;
    }

    for (int k = 0; k < static_cast<int>(temporary.size()); k++) {
        edges[left + k] = temporary[k];
    }
}

void mergeSortEdgesByCost(vector<Edge>& edges, int left, int right) {
    if (left >= right) {
        return;
    }

    int mid = left + (right - left) / 2;

    mergeSortEdgesByCost(edges, left, mid);
    mergeSortEdgesByCost(edges, mid + 1, right);
    mergeEdges(edges, left, mid, right);
}

void sortEdgesByCost(vector<Edge>& edges) {
    if (edges.size() <= 1) {
        return;
    }

    mergeSortEdgesByCost(edges, 0, static_cast<int>(edges.size()) - 1);
}

// ============================================================
// 6. UNION-FIND / DISJOINT SET UNION
// Bagian ini bukan MST, tetapi alat bantu Kruskal.
// Fungsi utamanya:
// - findRoot() mencari akar kelompok node.
// - unite() menggabungkan dua kelompok jika belum sama.
// ============================================================

class UnionFind {
private:
    vector<int> parent;
    vector<int> rankValue;

public:
    UnionFind(int totalNodes) {
        parent.resize(totalNodes);
        rankValue.resize(totalNodes);

        for (int i = 0; i < totalNodes; i++) {
            parent[i] = i;
            rankValue[i] = 0;
        }
    }

    int findRoot(int node) {
        if (parent[node] != node) {
            parent[node] = findRoot(parent[node]);
        }
        return parent[node];
    }

    bool unite(int a, int b) {
        int rootA = findRoot(a);
        int rootB = findRoot(b);

        if (rootA == rootB) {
            return false;
        }

        if (rankValue[rootA] < rankValue[rootB]) {
            parent[rootA] = rootB;
        } else if (rankValue[rootA] > rankValue[rootB]) {
            parent[rootB] = rootA;
        } else {
            parent[rootB] = rootA;
            rankValue[rootA]++;
        }

        return true;
    }
};

// ============================================================
// 7. KRUSKAL MST
// Tujuan:
//   Membentuk Minimum Spanning Tree dari complete graph.
// Langkah:
//   1. Urutkan semua edge berdasarkan cost.
//   2. Ambil edge terkecil satu per satu.
//   3. Gunakan Union-Find agar tidak membentuk siklus.
//   4. Berhenti ketika jumlah edge MST = jumlah sensor - 1.
// ============================================================

vector<Edge> findMSTUsingKruskal(vector<Edge> edges, int totalSensors) {
    vector<Edge> mstEdges;
    UnionFind unionFind(totalSensors);

    sortEdgesByCost(edges);

    for (int i = 0; i < static_cast<int>(edges.size()); i++) {
        Edge currentEdge = edges[i];

        if (unionFind.unite(currentEdge.from, currentEdge.to)) {
            mstEdges.push_back(currentEdge);
        }

        if (static_cast<int>(mstEdges.size()) == totalSensors - 1) {
            break;
        }
    }

    return mstEdges;
}

double calculateTotalMSTCost(const vector<Edge>& mstEdges) {
    double total = 0.0;

    for (int i = 0; i < static_cast<int>(mstEdges.size()); i++) {
        total += mstEdges[i].cost;
    }

    return total;
}

// ============================================================
// 8. MST ADJACENCY LIST BUILDER
// Kruskal menghasilkan MST dalam bentuk edge list.
// BFS membutuhkan adjacency list.
// Maka bagian ini mengubah edge list MST menjadi adjacency list.
// ============================================================

vector<vector<int> > buildMSTAdjacencyList(const vector<Edge>& mstEdges, int totalSensors) {
    vector<vector<int> > adjacencyList(totalSensors);

    for (int i = 0; i < static_cast<int>(mstEdges.size()); i++) {
        int from = mstEdges[i].from;
        int to = mstEdges[i].to;

        adjacencyList[from].push_back(to);
        adjacencyList[to].push_back(from);
    }

    return adjacencyList;
}

// ============================================================
// 9. SIMPLE QUEUE FOR BFS
// Dibuat sendiri agar tidak perlu memakai <queue>.
// ============================================================

class SimpleQueue {
private:
    vector<int> data;
    int frontIndex;

public:
    SimpleQueue() {
        frontIndex = 0;
    }

    void push(int value) {
        data.push_back(value);
    }

    int front() {
        return data[frontIndex];
    }

    void pop() {
        frontIndex++;
    }

    bool empty() {
        return frontIndex >= static_cast<int>(data.size());
    }
};

// ============================================================
// 10. BFS HOP ANALYSIS
// Tujuan:
//   Menghitung jumlah hop dari satu gateway ke semua sensor lain.
// Catatan:
//   BFS tidak menghitung cost kabel.
//   BFS menghitung jumlah lompatan komunikasi pada MST.
// ============================================================

GatewayResult runBFSFromGateway(const vector<vector<int> >& adjacencyList, int gatewayId) {
    int totalSensors = static_cast<int>(adjacencyList.size());
    vector<int> hopDistance(totalSensors, -1);
    SimpleQueue queue;

    hopDistance[gatewayId] = 0;
    queue.push(gatewayId);

    while (!queue.empty()) {
        int currentNode = queue.front();
        queue.pop();

        for (int i = 0; i < static_cast<int>(adjacencyList[currentNode].size()); i++) {
            int neighbor = adjacencyList[currentNode][i];

            if (hopDistance[neighbor] == -1) {
                hopDistance[neighbor] = hopDistance[currentNode] + 1;
                queue.push(neighbor);
            }
        }
    }

    int totalHop = 0;
    int maximumHop = 0;

    for (int i = 0; i < totalSensors; i++) {
        totalHop += hopDistance[i];
        maximumHop = getLargerInt(maximumHop, hopDistance[i]);
    }

    GatewayResult result;
    result.gatewayId = gatewayId;
    result.hopDistance = hopDistance;
    result.averageHop = static_cast<double>(totalHop) / totalSensors;
    result.maximumHop = maximumHop;

    return result;
}

// ============================================================
// 11. BRUTE FORCE GATEWAY OPTIMIZATION
// Bagian ini mencoba semua kemungkinan gateway.
// BFS digunakan sebagai alat ukur untuk menghitung hop.
// Brute force digunakan sebagai strategi pencarian kandidat terbaik.
// ============================================================

bool isBetterSingleGateway(const GatewayResult& candidate, const GatewayResult& best) {
    if (candidate.averageHop < best.averageHop) {
        return true;
    }

    if (nearlyEqual(candidate.averageHop, best.averageHop) && candidate.maximumHop < best.maximumHop) {
        return true;
    }

    if (nearlyEqual(candidate.averageHop, best.averageHop) &&
        candidate.maximumHop == best.maximumHop &&
        candidate.gatewayId < best.gatewayId) {
        return true;
    }

    return false;
}

GatewayResult findBestSingleGateway(const vector<vector<int> >& adjacencyList) {
    int totalSensors = static_cast<int>(adjacencyList.size());
    GatewayResult best = runBFSFromGateway(adjacencyList, 0);

    for (int gateway = 1; gateway < totalSensors; gateway++) {
        GatewayResult candidate = runBFSFromGateway(adjacencyList, gateway);

        if (isBetterSingleGateway(candidate, best)) {
            best = candidate;
        }
    }

    return best;
}

MultiGatewayResult evaluateGatewayCombination(const vector<vector<int> >& adjacencyList, const vector<int>& gatewayIds) {
    int totalSensors = static_cast<int>(adjacencyList.size());
    vector<int> nearestHop(totalSensors, -1);

    vector<GatewayResult> bfsResults;

    for (int i = 0; i < static_cast<int>(gatewayIds.size()); i++) {
        bfsResults.push_back(runBFSFromGateway(adjacencyList, gatewayIds[i]));
    }

    int totalNearestHop = 0;
    int maximumNearestHop = 0;

    for (int sensor = 0; sensor < totalSensors; sensor++) {
        int bestHopForThisSensor = bfsResults[0].hopDistance[sensor];

        for (int g = 1; g < static_cast<int>(bfsResults.size()); g++) {
            bestHopForThisSensor = getSmallerInt(bestHopForThisSensor, bfsResults[g].hopDistance[sensor]);
        }

        nearestHop[sensor] = bestHopForThisSensor;
        totalNearestHop += bestHopForThisSensor;
        maximumNearestHop = getLargerInt(maximumNearestHop, bestHopForThisSensor);
    }

    MultiGatewayResult result;
    result.gatewayIds = gatewayIds;
    result.nearestHop = nearestHop;
    result.averageNearestHop = static_cast<double>(totalNearestHop) / totalSensors;
    result.maximumNearestHop = maximumNearestHop;

    return result;
}

bool isBetterMultiGateway(const MultiGatewayResult& candidate, const MultiGatewayResult& best) {
    if (candidate.averageNearestHop < best.averageNearestHop) {
        return true;
    }

    if (nearlyEqual(candidate.averageNearestHop, best.averageNearestHop) &&
        candidate.maximumNearestHop < best.maximumNearestHop) {
        return true;
    }

    if (nearlyEqual(candidate.averageNearestHop, best.averageNearestHop) &&
        candidate.maximumNearestHop == best.maximumNearestHop) {
        for (int i = 0; i < static_cast<int>(candidate.gatewayIds.size()); i++) {
            if (candidate.gatewayIds[i] < best.gatewayIds[i]) {
                return true;
            }
            if (candidate.gatewayIds[i] > best.gatewayIds[i]) {
                return false;
            }
        }
    }

    return false;
}

MultiGatewayResult findBestTwoGateways(const vector<vector<int> >& adjacencyList) {
    int totalSensors = static_cast<int>(adjacencyList.size());

    vector<int> firstGateways;
    firstGateways.push_back(0);
    firstGateways.push_back(1);

    MultiGatewayResult best = evaluateGatewayCombination(adjacencyList, firstGateways);

    for (int i = 0; i < totalSensors; i++) {
        for (int j = i + 1; j < totalSensors; j++) {
            vector<int> candidateGateways;
            candidateGateways.push_back(i);
            candidateGateways.push_back(j);

            MultiGatewayResult candidate = evaluateGatewayCombination(adjacencyList, candidateGateways);

            if (isBetterMultiGateway(candidate, best)) {
                best = candidate;
            }
        }
    }

    return best;
}

MultiGatewayResult findBestThreeGateways(const vector<vector<int> >& adjacencyList) {
    int totalSensors = static_cast<int>(adjacencyList.size());

    vector<int> firstGateways;
    firstGateways.push_back(0);
    firstGateways.push_back(1);
    firstGateways.push_back(2);

    MultiGatewayResult best = evaluateGatewayCombination(adjacencyList, firstGateways);

    for (int i = 0; i < totalSensors; i++) {
        for (int j = i + 1; j < totalSensors; j++) {
            for (int k = j + 1; k < totalSensors; k++) {
                vector<int> candidateGateways;
                candidateGateways.push_back(i);
                candidateGateways.push_back(j);
                candidateGateways.push_back(k);

                MultiGatewayResult candidate = evaluateGatewayCombination(adjacencyList, candidateGateways);

                if (isBetterMultiGateway(candidate, best)) {
                    best = candidate;
                }
            }
        }
    }

    return best;
}

// ============================================================
// 12. TERMINAL OUTPUT
// ============================================================

void printSensorList(const vector<Sensor>& sensors) {
    cout << "\n=== SENSOR DATA ===" << endl;
    cout << left << setw(6) << "IDX"
         << setw(8) << "ID"
         << setw(18) << "NAME"
         << setw(18) << "TYPE"
         << setw(10) << "X"
         << setw(10) << "Y"
         << setw(10) << "Z" << endl;

    for (int i = 0; i < static_cast<int>(sensors.size()); i++) {
        cout << left << setw(6) << i
             << setw(8) << sensors[i].id
             << setw(18) << sensors[i].name
             << setw(18) << sensors[i].type
             << setw(10) << fixed << setprecision(2) << sensors[i].x
             << setw(10) << fixed << setprecision(2) << sensors[i].y
             << setw(10) << fixed << setprecision(2) << sensors[i].z
             << endl;
    }
}

void printMSTEdges(const vector<Sensor>& sensors, const vector<Edge>& mstEdges) {
    cout << "\n=== KRUSKAL MST EDGES ===" << endl;

    for (int i = 0; i < static_cast<int>(mstEdges.size()); i++) {
        int from = mstEdges[i].from;
        int to = mstEdges[i].to;

        cout << setw(2) << i + 1 << ". "
             << sensors[from].name << " -- "
             << sensors[to].name << " | cost = "
             << fixed << setprecision(2) << mstEdges[i].cost << " meter" << endl;
    }
}

void printGatewayResult(const vector<Sensor>& sensors, const GatewayResult& result) {
    cout << "\n=== BEST SINGLE GATEWAY ===" << endl;
    cout << "Gateway       : " << sensors[result.gatewayId].name << " (index " << result.gatewayId << ")" << endl;
    cout << "Average Hop   : " << fixed << setprecision(2) << result.averageHop << endl;
    cout << "Maximum Hop   : " << result.maximumHop << endl;

    cout << "\nHop Distance:" << endl;
    for (int i = 0; i < static_cast<int>(result.hopDistance.size()); i++) {
        cout << "  " << sensors[i].name << " -> " << result.hopDistance[i] << " hop" << endl;
    }
}

void printMultiGatewayResult(const vector<Sensor>& sensors, const MultiGatewayResult& result, const string& title) {
    cout << "\n=== " << title << " ===" << endl;
    cout << "Gateways      : ";

    for (int i = 0; i < static_cast<int>(result.gatewayIds.size()); i++) {
        int gatewayIndex = result.gatewayIds[i];
        if (i > 0) {
            cout << ", ";
        }
        cout << sensors[gatewayIndex].name << " (index " << gatewayIndex << ")";
    }

    cout << endl;
    cout << "Average Hop   : " << fixed << setprecision(2) << result.averageNearestHop << endl;
    cout << "Maximum Hop   : " << result.maximumNearestHop << endl;
}

void printSummary(const vector<Sensor>& sensors,
                  const vector<Edge>& completeGraph,
                  const vector<Edge>& mstEdges,
                  const GatewayResult& bestSingleGateway,
                  const MultiGatewayResult& bestTwoGateways,
                  const MultiGatewayResult& bestThreeGateways) {
    cout << "\n============================================================" << endl;
    cout << "AGROMESH SIMULATION SUMMARY" << endl;
    cout << "============================================================" << endl;
    cout << "Total Sensor         : " << sensors.size() << endl;
    cout << "Complete Graph Edge  : " << completeGraph.size() << endl;
    cout << "MST Edge             : " << mstEdges.size() << endl;
    cout << "Total MST Cost       : " << fixed << setprecision(2) << calculateTotalMSTCost(mstEdges) << " meter" << endl;
    cout << "Best Single Gateway  : " << sensors[bestSingleGateway.gatewayId].name << endl;
    cout << "Single Avg Hop       : " << fixed << setprecision(2) << bestSingleGateway.averageHop << endl;
    cout << "Best Two Gateways    : " << joinGatewayIds(bestTwoGateways.gatewayIds) << endl;
    cout << "Two Gateway Avg Hop  : " << fixed << setprecision(2) << bestTwoGateways.averageNearestHop << endl;
    cout << "Best Three Gateways  : " << joinGatewayIds(bestThreeGateways.gatewayIds) << endl;
    cout << "Three Gateway Avg Hop: " << fixed << setprecision(2) << bestThreeGateways.averageNearestHop << endl;
    cout << "============================================================" << endl;
}

// ============================================================
// 13. CSV EXPORTER
// ============================================================

void exportMSTEdgesToCSV(const string& filename, const vector<Sensor>& sensors, const vector<Edge>& mstEdges) {
    ofstream file(filename.c_str());

    if (!file.is_open()) {
        cout << "WARNING: Gagal membuat file " << filename << endl;
        return;
    }

    file << "from_index,from_id,from_name,to_index,to_id,to_name,cost\n";

    for (int i = 0; i < static_cast<int>(mstEdges.size()); i++) {
        int from = mstEdges[i].from;
        int to = mstEdges[i].to;

        file << from << ","
             << sensors[from].id << ","
             << sensors[from].name << ","
             << to << ","
             << sensors[to].id << ","
             << sensors[to].name << ","
             << fixed << setprecision(2) << mstEdges[i].cost << "\n";
    }

    file.close();
}

void exportGatewayResultToCSV(const string& filename,
                              const GatewayResult& singleGateway,
                              const MultiGatewayResult& twoGateways,
                              const MultiGatewayResult& threeGateways) {
    ofstream file(filename.c_str());

    if (!file.is_open()) {
        cout << "WARNING: Gagal membuat file " << filename << endl;
        return;
    }

    file << "configuration,gateways,average_hop,maximum_hop\n";
    file << "single," << singleGateway.gatewayId << ","
         << fixed << setprecision(2) << singleGateway.averageHop << ","
         << singleGateway.maximumHop << "\n";

    file << "two," << joinGatewayIds(twoGateways.gatewayIds) << ","
         << fixed << setprecision(2) << twoGateways.averageNearestHop << ","
         << twoGateways.maximumNearestHop << "\n";

    file << "three," << joinGatewayIds(threeGateways.gatewayIds) << ","
         << fixed << setprecision(2) << threeGateways.averageNearestHop << ","
         << threeGateways.maximumNearestHop << "\n";

    file.close();
}

void exportHopDistanceToCSV(const string& filename,
                            const vector<Sensor>& sensors,
                            const GatewayResult& singleGateway,
                            const MultiGatewayResult& twoGateways,
                            const MultiGatewayResult& threeGateways) {
    ofstream file(filename.c_str());

    if (!file.is_open()) {
        cout << "WARNING: Gagal membuat file " << filename << endl;
        return;
    }

    file << "sensor_index,sensor_id,sensor_name,single_gateway_hop,two_gateway_nearest_hop,three_gateway_nearest_hop\n";

    for (int i = 0; i < static_cast<int>(sensors.size()); i++) {
        file << i << ","
             << sensors[i].id << ","
             << sensors[i].name << ","
             << singleGateway.hopDistance[i] << ","
             << twoGateways.nearestHop[i] << ","
             << threeGateways.nearestHop[i] << "\n";
    }

    file.close();
}

// ============================================================
// 14. MAIN PROGRAM
// Main hanya mengatur alur program.
// Detail algoritma ada di fungsi masing-masing.
// ============================================================

int main(int argc, char* argv[]) {
    cout << "============================================================" << endl;
    cout << "AGROMESH - Smart Farming IoT Network Simulator" << endl;
    cout << "============================================================" << endl;

    if (argc < 2) {
        cout << "Cara menjalankan:" << endl;
        cout << "  ./agromesh sensors.csv" << endl;
        return 0;
    }

    string filename = argv[1];
    vector<Sensor> sensors;

    // 1. Read CSV
    if (!loadSensorsFromCSV(filename, sensors)) {
        return 1;
    }

    // 2. Validate input data
    if (!validateSensors(sensors)) {
        return 1;
    }

    // 3. Build complete graph
    vector<Edge> completeGraph = buildCompleteGraph(sensors);

    // 4. Kruskal MST
    vector<Edge> mstEdges = findMSTUsingKruskal(completeGraph, static_cast<int>(sensors.size()));

    // 5. Convert MST edge list into adjacency list for BFS
    vector<vector<int> > mstAdjacencyList = buildMSTAdjacencyList(mstEdges, static_cast<int>(sensors.size()));

    // 6. BFS + brute force gateway optimization
    GatewayResult bestSingleGateway = findBestSingleGateway(mstAdjacencyList);
    MultiGatewayResult bestTwoGateways = findBestTwoGateways(mstAdjacencyList);
    MultiGatewayResult bestThreeGateways = findBestThreeGateways(mstAdjacencyList);

    // 7. Print result to terminal
    printSensorList(sensors);
    printMSTEdges(sensors, mstEdges);
    printGatewayResult(sensors, bestSingleGateway);
    printMultiGatewayResult(sensors, bestTwoGateways, "BEST TWO GATEWAYS");
    printMultiGatewayResult(sensors, bestThreeGateways, "BEST THREE GATEWAYS");
    printSummary(sensors, completeGraph, mstEdges, bestSingleGateway, bestTwoGateways, bestThreeGateways);

    // 8. Export result files
    exportMSTEdgesToCSV("mst_edges.csv", sensors, mstEdges);
    exportGatewayResultToCSV("gateway_result.csv", bestSingleGateway, bestTwoGateways, bestThreeGateways);
    exportHopDistanceToCSV("hop_distance.csv", sensors, bestSingleGateway, bestTwoGateways, bestThreeGateways);

    cout << "\nFile hasil dibuat:" << endl;
    cout << "  - mst_edges.csv" << endl;
    cout << "  - gateway_result.csv" << endl;
    cout << "  - hop_distance.csv" << endl;

    return 0;
}
