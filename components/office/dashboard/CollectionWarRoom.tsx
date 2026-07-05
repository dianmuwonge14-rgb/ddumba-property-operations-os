export default function CollectionWarRoom() {
    return (
        <div className="enterprise-panel overflow-hidden">

            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">
                        Collection War Room
                    </h2>

                    <p className="text-sm text-slate-500 mt-1">
                        Live collection monitoring and office performance
                    </p>
                </div>

                <div className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-sm font-semibold">
                    UGX 12.4M Collected Today
                </div>
            </div>

            <div className="overflow-x-auto">

                    <table className="enterprise-table">

                    <thead>
                        <tr>
                            <th className="text-left px-6 py-4 text-sm font-semibold">
                                Tenant
                            </th>

                            <th className="text-left px-6 py-4 text-sm font-semibold">
                                Property
                            </th>

                            <th className="text-left px-6 py-4 text-sm font-semibold">
                                Due
                            </th>

                            <th className="text-left px-6 py-4 text-sm font-semibold">
                                Collector
                            </th>

                            <th className="text-left px-6 py-4 text-sm font-semibold">
                                Status
                            </th>
                        </tr>
                    </thead>

                    <tbody>

                        <tr className="border-t">
                            <td className="px-6 py-4">
                                John Kato
                            </td>

                            <td className="px-6 py-4">
                                Kigungu Apartments
                            </td>

                            <td className="px-6 py-4">
                                UGX 850,000
                            </td>

                            <td className="px-6 py-4">
                                Sarah
                            </td>

                            <td className="px-6 py-4">
                                <span className="status-chip bg-emerald-50 text-emerald-700">
                                    PAID
                                </span>
                            </td>
                        </tr>

                        <tr className="border-t">
                            <td className="px-6 py-4">
                                David Mugisha
                            </td>

                            <td className="px-6 py-4">
                                Entebbe Plaza
                            </td>

                            <td className="px-6 py-4">
                                UGX 1,200,000
                            </td>

                            <td className="px-6 py-4">
                                Moses
                            </td>

                            <td className="px-6 py-4">
                                <span className="status-chip bg-amber-50 text-amber-700">
                                    PENDING
                                </span>
                            </td>
                        </tr>

                        <tr className="border-t">
                            <td className="px-6 py-4">
                                Sarah N.
                            </td>

                            <td className="px-6 py-4">
                                Lake View Residences
                            </td>

                            <td className="px-6 py-4">
                                UGX 950,000
                            </td>

                            <td className="px-6 py-4">
                                Brian
                            </td>

                            <td className="px-6 py-4">
                                <span className="status-chip bg-rose-50 text-rose-700">
                                    OVERDUE
                                </span>
                            </td>
                        </tr>

                    </tbody>

                </table>

            </div>
        </div>
    );
}
