export default function SettingsPage() {
    return (
        <main className="p-8">

            <div className="bg-white rounded-3xl shadow-sm p-8">

                <h1 className="text-4xl font-bold mb-2">
                    System Settings
                </h1>

                <p className="text-gray-500 mb-8">
                    Configure attendance rules and company settings
                </p>

                <div className="grid grid-cols-2 gap-6">

                    {/* Company Info */}
                    <div className="border rounded-2xl p-6">
                        <h2 className="font-bold text-xl mb-4">
                            Company Information
                        </h2>

                        <input
                            className="w-full border rounded-xl p-3 mb-3"
                            defaultValue="Ddumba Property Management"
                        />

                        <input
                            className="w-full border rounded-xl p-3 mb-3"
                            placeholder="Company Email"
                        />

                        <input
                            className="w-full border rounded-xl p-3"
                            placeholder="Company Phone"
                        />
                    </div>

                    {/* Attendance Rules */}
                    <div className="border rounded-2xl p-6">
                        <h2 className="font-bold text-xl mb-4">
                            Attendance Rules
                        </h2>

                        <input
                            type="time"
                            className="w-full border rounded-xl p-3 mb-3"
                            defaultValue="08:00"
                        />

                        <input
                            type="time"
                            className="w-full border rounded-xl p-3 mb-3"
                            defaultValue="17:00"
                        />

                        <input
                            type="number"
                            className="w-full border rounded-xl p-3"
                            defaultValue="10"
                        />
                    </div>

                </div>

                <div className="mt-8 flex justify-end">

                    <button className="bg-green-600 text-white px-6 py-3 rounded-xl">
                        Save Settings
                    </button>

                </div>

            </div>

        </main>
    );
}